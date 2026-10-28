import "dotenv/config";
import { createAndSendInvoice } from "../src/paypal.js";

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

console.log(await createAndSendInvoice({
  client_name: "Priya Shah",
  client_email: process.env.TEST_BUYER_EMAIL,
  currency: "USD",
  invoice_date: day(-20),
  due_date: day(-6),
  notes: "Thanks for your business!",
  items: [{ description: "Website redesign, phase 1", quantity: 1, unit_price: 450, unit: "units" }],
}));