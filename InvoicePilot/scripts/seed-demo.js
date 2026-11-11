import "dotenv/config";
import { createAndSendInvoice, listInvoices, recordExternalPayment } from "../src/paypal.js";

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const demo = [
  { client: "Daniel Okafor", what: "Mobile app UI kit", price: 380, invoiced: -10, due: -2 },
  { client: "Sofia Marino", what: "Brand identity package", price: 920, invoiced: -30, due: -14 },
  { client: "Liam Becker", what: "Landing page copywriting", price: 275, invoiced: -60, due: -35 },
  { client: "Aisha Rahman", what: "Monthly SEO retainer", price: 600, invoiced: 0, due: 3 },
  { client: "Noah Carter", what: "Logo animation", price: 210, invoiced: 0, due: 21 },
  { client: "Emma Chen", what: "Social media graphics", price: 340, invoiced: -15, due: -1, paid: true },
];

const existingInvoices = await listInvoices();

for (const d of demo) {
  const alreadySeeded = existingInvoices.some((invoice) =>
    invoice.client === d.client &&
    invoice.currency === "USD" &&
    Number(invoice.total) === d.price
  );
  if (alreadySeeded) {
    console.log(`Skipped existing demo invoice for ${d.client}: ${d.what}`);
    continue;
  }

  try {
    const inv = await createAndSendInvoice({
      client_name: d.client,
      client_email: process.env.TEST_BUYER_EMAIL,
      currency: "USD",
      invoice_date: day(d.invoiced),
      due_date: day(d.due),
      notes: "Thanks for your business!",
      items: [{ description: d.what, quantity: 1, unit_price: d.price, unit: "units" }],
    });

    console.log(`Created #${inv.number}: ${d.client} $${d.price}`);

    if (d.paid) {
      try {
        await recordExternalPayment(inv.id, { amount: d.price, currency: "USD" });
        console.log("  → marked as paid");
      } catch (e) {
        console.warn("  ! could not record payment:", e.message);
      }
    }
  } catch (e) {
    console.error(`Failed for ${d.client}:`, e.message);
  }
}

console.log("Done. Reload the app.");
