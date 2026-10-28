const base = () => process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let cached = { token: null, expires: 0 };

async function getToken() {
  if (cached.token && Date.now() < cached.expires) return cached.token;
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) throw new PayPalError("PayPal authentication failed", res.status, data);
  cached = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return cached.token;
}

async function pp(path, { method = "GET", body, headers = {} } = {}) {
  const token = await getToken();
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = data.details?.[0];
    const msg = detail ? `${detail.issue}: ${detail.description}` : data.message;
    throw new PayPalError(msg || "PayPal request failed", res.status, data);
  }
  return data;
}

// PayPal only accepts fixed payment terms, so map "days" to the nearest one.
function termFromDays(days) {
  const d = Number(days) || 0;
  if (d <= 0) return "DUE_ON_RECEIPT";
  for (const n of [10, 15, 30, 45, 60]) if (d <= n) return `NET_${n}`;
  return "NET_90";
}

const money = (n) => Number(n).toFixed(2);

export function buildInvoicePayload(draft, invoiceNumber) {
  const [given, ...rest] = (draft.client_name || "Client").trim().split(/\s+/);
  const cur = draft.currency || "USD";
  const paymentTerm = draft.due_date
    ? { term_type: "DUE_ON_DATE_SPECIFIED", due_date: draft.due_date }
    : { term_type: termFromDays(draft.due_in_days) };
  return {
    detail: {
      ...(invoiceNumber ? { invoice_number: invoiceNumber } : {}),
      ...(draft.invoice_date ? { invoice_date: draft.invoice_date } : {}),
      currency_code: cur,
      note: draft.notes || undefined,
      payment_term: paymentTerm,
    },
    invoicer: {
      name: { business_name: process.env.BUSINESS_NAME || "InvoicePilot Demo" },
      email_address: process.env.PAYPAL_BUSINESS_EMAIL,
    },
    primary_recipients: [
      {
        billing_info: {
          name: { given_name: given, surname: rest.join(" ") || undefined },
          email_address: draft.client_email,
        },
      },
    ],
    items: draft.items.map((i) => ({
      name: i.description,
      quantity: String(i.quantity),
      unit_amount: { currency_code: cur, value: money(i.unit_price) },
      unit_of_measure: i.unit === "hours" ? "HOURS" : "QUANTITY",
    })),
  };
}

export async function createAndSendInvoice(draft) {
  let invoiceNumber;
  try {
    const n = await pp("/v2/invoicing/generate-next-invoice-number", { method: "POST" });
    invoiceNumber = n.invoice_number;
  } catch (e) {
    console.warn("Invoice number step failed:", e.message);
  }

  const created = await pp("/v2/invoicing/invoices", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: buildInvoicePayload(draft, invoiceNumber),
  });
  const id = created.id || created.href?.split("/").pop();

  await pp(`/v2/invoicing/invoices/${id}/send`, {
    method: "POST",
    body: { send_to_recipient: true, send_to_invoicer: false },
  });

  const full = await pp(`/v2/invoicing/invoices/${id}`);
  return {
    id,
    number: full.detail?.invoice_number,
    status: full.status,
    total: full.amount?.value,
    currency: full.amount?.currency_code,
    payUrl: full.detail?.metadata?.recipient_view_url,
  };
}

/* ---------- Status logic: PayPal has no "overdue" status, so we derive it ---------- */

const PAID = new Set(["PAID", "MARKED_AS_PAID", "PAID_EXTERNAL"]);
const OPEN = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"]);

export function describeStatus(status, dueDate, now = new Date()) {
  if (PAID.has(status)) return { state: "paid", daysOverdue: 0 };
  if (OPEN.has(status)) {
    if (dueDate) {
      const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const due = Date.parse(`${dueDate}T00:00:00Z`);
      const days = Math.floor((today - due) / 86400000);
      if (days > 0) return { state: "overdue", daysOverdue: days };
    }
    return { state: "open", daysOverdue: 0 };
  }
  if (status === "DRAFT" || status === "SCHEDULED") return { state: "draft", daysOverdue: 0 };
  return { state: "closed", daysOverdue: 0 };
}

function mapInvoice(inv) {
  const dueDate = inv.detail?.payment_term?.due_date;
  const { state, daysOverdue } = describeStatus(inv.status, dueDate);
  const billing = inv.primary_recipients?.[0]?.billing_info;
  const name = [billing?.name?.given_name, billing?.name?.surname].filter(Boolean).join(" ");
  return {
    id: inv.id,
    number: inv.detail?.invoice_number,
    status: inv.status,
    state,
    daysOverdue,
    client: name || "—",
    email: billing?.email_address,
    total: inv.amount?.value,
    due: inv.due_amount?.value ?? inv.amount?.value,
    currency: inv.amount?.currency_code || inv.detail?.currency_code || "USD",
    invoiceDate: inv.detail?.invoice_date,
    dueDate,
    payUrl: inv.detail?.metadata?.recipient_view_url,
  };
}

export async function listInvoices() {
  const data = await pp("/v2/invoicing/invoices?page=1&page_size=50&total_required=true");
  console.log(JSON.stringify(data.items?.[0], null, 2));
  return (data.items || [])
    .map(mapInvoice)
    .sort((a, b) => (b.invoiceDate || "").localeCompare(a.invoiceDate || "") || (b.number || "").localeCompare(a.number || ""));
}

export async function getInvoice(id) {
  return mapInvoice(await pp(`/v2/invoicing/invoices/${id}`));
}

// PayPal's own reminder email (only works for UNPAID / SENT / PARTIALLY_PAID; max 2 per day).
export async function sendReminder(id, { subject, note }) {
  await pp(`/v2/invoicing/invoices/${id}/remind`, {
    method: "POST",
    body: { subject, note, send_to_invoicer: false },
  });
  return { ok: true };
}