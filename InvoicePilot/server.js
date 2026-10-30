import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { parseNote, draftReminder, defaultTone } from "./src/ai.js";
import { createAndSendInvoice, listInvoices, getInvoice, sendReminder } from "./src/paypal.js";
import { getBriefing } from "./src/insights.js";

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

const bryntumDir = fileURLToPath(new URL("./node_modules/@bryntum/calendar", import.meta.url));
app.use("/vendor/bryntum", express.static(bryntumDir));

app.set("trust proxy", 1); // needed on Render so we see each visitor's real IP

const TEN_MIN = 10 * 60 * 1000;
function limit(max, windowMs = TEN_MIN) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: "Too many requests. Please wait a few minutes and try again." });
    }
    recent.push(now);
    hits.set(req.ip, recent);
    next();
  };
}

app.use("/api", limit(120));
app.use("/api/parse", limit(20));
app.use("/api/invoices/:id/reminder-draft", limit(20));
app.use("/api/insights", limit(30));

app.get("/healthz", (_req, res) => res.send("ok"));

const validId = (id) => /^[A-Za-z0-9-]+$/.test(id || "");

function validateDraft(d) {
  const errors = [];
  if (!d?.client_name?.trim()) errors.push("Client name is required.");
  if (!/^\S+@\S+\.\S+$/.test(d?.client_email || "")) errors.push("A valid client email is required.");
  if (!Array.isArray(d?.items) || d.items.length === 0) errors.push("Add at least one line item.");
  (d?.items || []).forEach((i, n) => {
    if (!i.description?.trim()) errors.push(`Item ${n + 1} needs a description.`);
    if (!(Number(i.quantity) > 0)) errors.push(`Item ${n + 1} needs a quantity above 0.`);
    if (!(Number(i.unit_price) > 0)) errors.push(`Item ${n + 1} needs a price above 0.`);
  });
  return errors;
}

app.post("/api/parse", async (req, res) => {
  try {
    const text = (req.body.text || "").trim();
    if (!text) return res.status(400).json({ error: "Write a note first." });
    res.json({ draft: await parseNote(text) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI parsing failed: " + e.message });
  }
});

app.post("/api/invoices", async (req, res) => {
  const errors = validateDraft(req.body.draft);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  try {
    res.json({ invoice: await createAndSendInvoice(req.body.draft) });
  } catch (e) {
    console.error(e.details ? JSON.stringify(e.details, null, 2) : e);
    res.status(502).json({ error: "PayPal said: " + e.message });
  }
});

app.get("/api/invoices", async (_req, res) => {
  try {
    res.json({ invoices: await listInvoices() });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "PayPal said: " + e.message });
  }
});

app.get("/api/insights", async (_req, res) => {
  try {
    res.json(await getBriefing(await listInvoices()));
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
});

// Draft an AI reminder for one invoice (nothing is sent here).
app.post("/api/invoices/:id/reminder-draft", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Bad invoice id." });
  try {
    const inv = await getInvoice(req.params.id);
    if (inv.state !== "open" && inv.state !== "overdue") {
      return res.status(400).json({ error: "Only sent, unpaid invoices can get a reminder." });
    }
    const suggestedTone = defaultTone(inv.daysOverdue);
    const tone = ["friendly", "firm", "final"].includes(req.body?.tone) ? req.body.tone : suggestedTone;
    const draft = await draftReminder({
      tone,
      sender_name: process.env.BUSINESS_NAME || "Your freelancer",
      client_first_name: inv.client.split(" ")[0],
      invoice_number: inv.number || inv.id,
      amount_due: inv.due,
      currency: inv.currency,
      due_date: inv.dueDate || "not specified",
      days_overdue: inv.daysOverdue,
      payment_link: inv.payUrl || "",
    });
    res.json({ invoice: inv, tone, suggestedTone, draft });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
});

// Send PayPal's official reminder for one invoice.
app.post("/api/invoices/:id/remind", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Bad invoice id." });
  const { subject, note } = req.body || {};
  if (!subject?.trim() || !note?.trim()) return res.status(400).json({ error: "Subject and message are required." });
  try {
    res.json(await sendReminder(req.params.id, { subject: subject.trim(), note: note.trim() }));
  } catch (e) {
    console.error(e.details ? JSON.stringify(e.details, null, 2) : e);
    res.status(502).json({ error: "PayPal said: " + e.message });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`InvoicePilot running on http://localhost:${process.env.PORT || 3000}`)
);