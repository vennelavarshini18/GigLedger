const base = () => process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

function requireEmailAddress(value, settingName) {
  if (
    typeof value !== "string" ||
    value.includes("://") ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    throw new Error(`${settingName} must be an email address, not a PayPal dashboard URL.`);
  }
  return value;
}

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
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const detail = data.details?.[0];
    const msg = detail
      ? `${detail.issue}: ${detail.description}`
      : data.message;

    throw new PayPalError(
      msg || "PayPal request failed",
      res.status,
      data
    );
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
  const businessEmail = requireEmailAddress(
    process.env.PAYPAL_BUSINESS_EMAIL,
    "PAYPAL_BUSINESS_EMAIL"
  );
  const clientEmail = requireEmailAddress(draft.client_email, "client_email");
  return {
    detail: {
      ...(invoiceNumber ? { invoice_number: invoiceNumber } : {}),
      currency_code: cur,
      note: draft.notes || undefined,
      payment_term: { term_type: termFromDays(draft.due_in_days) },
    },
    invoicer: {
      name: { business_name: process.env.BUSINESS_NAME || "InvoicePilot Demo" },
      email_address: businessEmail,
    },
    primary_recipients: [
      {
        billing_info: {
          name: { given_name: given, surname: rest.join(" ") || undefined },
          email_address: clientEmail,
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
  requireEmailAddress(process.env.PAYPAL_BUSINESS_EMAIL, "PAYPAL_BUSINESS_EMAIL");
  requireEmailAddress(draft.client_email, "client_email");
  let invoiceNumber;
  try {
    const n = await pp("/v2/invoicing/generate-next-invoice-number", { method: "POST" });
    invoiceNumber = n.invoice_number;
  } catch { /* PayPal will auto-number if allowed */ }

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

export async function listInvoices() {
  const data = await pp("/v2/invoicing/invoices?page=1&page_size=20&total_required=true");
  return (data.items || []).map((inv) => ({
    id: inv.id,
    number: inv.detail?.invoice_number,
    status: inv.status,
    client: inv.primary_recipients?.[0]?.billing_info?.email_address,
    total: inv.amount?.value,
    currency: inv.amount?.currency_code,
    dueDate: inv.detail?.payment_term?.due_date,
  }));
}