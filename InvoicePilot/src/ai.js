import { GoogleGenAI, Type } from "@google/genai";

const SYSTEM = `You turn a freelancer's informal note into a structured invoice draft.

Rules:
- Never invent amounts, rates, quantities, or email addresses. If something is not stated, use 0 for numbers or "" for text, and list it in missing_fields.
- If only a total is given, create one line item with quantity 1 and unit_price equal to the total.
- If hours and an hourly rate are given, quantity = hours, unit = "hours", unit_price = rate.
- Split multiple services into separate line items.
- Due date: convert phrases like "in 2 weeks" or "net 30" to days. Default to 14 if not stated.
- Currency: use the symbol or word given. Default to USD. If the note uses a currency outside the allowed list (for example INR), use USD and add "currency" to missing_fields.
- notes: a short, polite thank-you line, unless the user specifies note text.
- confidence: "high" if every field was stated, "medium" if you defaulted something, "low" if the note was very unclear.`;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    client_name: { type: Type.STRING },
    client_email: { type: Type.STRING },
    currency: { type: Type.STRING, enum: ["USD", "EUR", "GBP", "CAD", "AUD"] },
    due_in_days: { type: Type.INTEGER },
    notes: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit_price: { type: Type.NUMBER },
          unit: { type: Type.STRING, enum: ["hours", "units"] },
        },
        required: ["description", "quantity", "unit_price", "unit"],
      },
    },
    missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
  },
  required: ["client_name", "client_email", "currency", "due_in_days", "notes", "items", "missing_fields", "confidence"],
};

export async function parseNote(text) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let response;
  try {
    response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-flash-latest",
      contents: text,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
        temperature: 0,
      },
    });
  } catch (e) {
    if (String(e.message).includes("429")) {
      throw new Error("The AI is rate-limited right now. Wait a minute and try again.");
    }
    throw e;
  }
  try {
    return JSON.parse(response.text);
  } catch {
    throw new Error("The AI returned an unreadable draft. Please try again.");
  }
}

/* ---------- Payment reminder drafting ---------- */

export function defaultTone(daysOverdue) {
  if (daysOverdue <= 3) return "friendly";
  if (daysOverdue <= 20) return "firm";
  return "final";
}

const REMINDER_SYSTEM = `You write payment reminder messages for a freelancer to send to a client about an unpaid invoice.
Use ONLY the facts provided. Never invent late fees, interest, deadlines, legal action, or past conversations.

Tone guide:
- friendly: warm and light, assumes it was simply missed. If the invoice is not overdue yet, make it a gentle heads-up.
- firm: polite but direct, states how many days overdue, asks for a payment date or confirmation within a few days.
- final: serious and professional, says this is a final reminder before the freelancer follows up another way. Never threaten legal action or fees.

Rules:
- Under 110 words, plain text, no emojis.
- Start with "Hi <first name>,".
- Mention the invoice number, the amount with its currency, and the due date.
- If a payment link is provided, put it on its own line exactly as given.
- Sign off with the sender's name.
- Subject: under 70 characters and includes the invoice number.`;

const REMINDER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING },
    message: { type: Type.STRING },
  },
  required: ["subject", "message"],
};

export async function draftReminder(ctx) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let response;
  try {
    response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-flash-latest",
      contents: JSON.stringify(ctx),
      config: {
        systemInstruction: REMINDER_SYSTEM,
        responseMimeType: "application/json",
        responseSchema: REMINDER_SCHEMA,
        temperature: 0.4,
      },
    });
  } catch (e) {
    if (String(e.message).includes("429")) {
      throw new Error("The AI is rate-limited right now. Wait a minute and try again.");
    }
    throw e;
  }
  try {
    return JSON.parse(response.text);
  } catch {
    throw new Error("The AI returned an unreadable reminder. Please try again.");
  }
}