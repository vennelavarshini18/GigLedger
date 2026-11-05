# GigLedger

GigLedger is a freelance invoicing and payment follow-up workspace for creators and agencies that bill international clients. It turns a plain-language note into a real PayPal invoice, tracks due dates and payment status, and drafts the right reminder when an invoice runs late.

## Why it exists
Freelancers lose valuable time turning project notes into invoices and chasing clients manually. GigLedger streamlines that flow so you can focus on delivery instead of admin.

## What it includes
- AI-powered invoice drafting from a natural-language note
- PayPal sandbox invoice creation and sending
- Outstanding and overdue tracking
- Payment calendar for upcoming due dates
- AI reminder drafting with tone based on lateness
- Cash-flow briefing to surface what should be chased first

## Tech stack
- Node.js + Express
- PayPal Invoicing API (sandbox)
- Google Gemini for parsing and reminder drafting
- Bryntum Calendar for the payment schedule
- Static frontend with a premium SaaS landing page

## Repository structure
```text
Freelancer-invoice-assistant/
├── LICENSE
├── README.md
├── InvoicePilot/
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   ├── server.js
│   ├── public/
│   ├── scripts/
│   ├── src/
│   ├── postman/
│   └── node_modules/  # generated locally after npm install
└── .git/
```

## Local setup
From the repo root:

```bash
git clone https://github.com/vennelavarshini18/Freelancer-invoice-assistant.git
cd Freelancer-invoice-assistant/InvoicePilot
npm install
copy .env.example .env
```

Then populate the required values in `.env` before starting the app:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_BUSINESS_EMAIL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `TEST_BUYER_EMAIL`
- `BUSINESS_NAME`

Run the app:

```bash
npm start
```

Open: http://localhost:3000

## Demo flow
1. Open the landing page and choose a sample note.
2. Use the AI to draft an invoice.
3. Review and adjust the invoice details.
4. Approve and send it through the sandbox PayPal flow.
5. Track invoice states from the dashboard and payment calendar.
6. Draft and send a reminder when a payment becomes late.

## Sandbox notes
- All PayPal actions run against the sandbox environment.
- Use a valid sandbox business account for the business email.
- Invoices to some regions, such as India-based sandbox clients, may be rejected by PayPal policy.
- Keep secrets in your local `.env` file and do not commit them.

## Postman
A PayPal API collection is included under `InvoicePilot/postman/` for manual sandbox testing.

## License
This project is licensed under the MIT License.
