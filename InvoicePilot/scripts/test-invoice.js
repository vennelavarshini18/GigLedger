import "dotenv/config";
import { createAndSendInvoice } from "../src/paypal.js";

const result = await createAndSendInvoice({
  client_name: "Test Client",
  client_email: process.env.TEST_BUYER_EMAIL,
  currency: "USD",
  due_in_days: 14,
  notes: "Thanks for your business!",
  items: [{ description: "Logo design", quantity: 5, unit_price: 40, unit: "hours" }],
});
console.log(result);