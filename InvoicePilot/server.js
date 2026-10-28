import "dotenv/config";
import express from "express";
import { parseNote } from "./src/ai.js";
import { createAndSendInvoice, listInvoices, PayPalError } from "./src/paypal.js";

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

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
    const issue = e instanceof PayPalError ? e.details?.details?.[0]?.description || e.message : e.message;
    res.status(502).json({ error: "PayPal said: " + issue });
  }
});

app.get("/api/invoices", async (_req, res) => {
  try {
    res.json({ invoices: await listInvoices() });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`InvoicePilot running on http://localhost:${process.env.PORT || 3000}`)
);