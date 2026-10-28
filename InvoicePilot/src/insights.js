import { writeBriefing } from "./ai.js";

const isOpen = (i) => i.state === "open" || i.state === "overdue";

function sum(list, pick) {
  const by = {};
  list.forEach((i) => { by[i.currency] = (by[i.currency] || 0) + Number(pick(i) || 0); });
  const parts = Object.entries(by).map(([c, v]) => `${c} ${v.toFixed(2)}`);
  return parts.length ? parts.join(" + ") : "0.00";
}

export function buildFacts(invoices, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const open = invoices.filter(isOpen).map((i) => ({
    ...i,
    daysUntilDue: i.dueDate ? Math.ceil((Date.parse(`${i.dueDate}T00:00:00Z`) - today) / 86400000) : null,
  }));

  const overdue = open
    .filter((i) => i.state === "overdue")
    .sort((a, b) => b.daysOverdue - a.daysOverdue || Number(b.due) - Number(a.due));
  const dueSoon = open
    .filter((i) => i.state === "open" && i.daysUntilDue !== null && i.daysUntilDue <= 7)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const paid = invoices.filter((i) => i.state === "paid");

  const brief = (i) => ({
    invoice: i.number || i.id,
    client: i.client,
    amount: `${i.currency} ${Number(i.due).toFixed(2)}`,
    due_date: i.dueDate,
    days_overdue: i.daysOverdue,
    days_until_due: i.daysUntilDue,
  });

  return {
    hasOpen: open.length > 0,
    priority: overdue[0] || dueSoon[0] || null,
    facts: {
      unpaid_total: sum(open, (i) => i.due),
      unpaid_count: open.length,
      overdue_total: sum(overdue, (i) => i.due),
      overdue_count: overdue.length,
      due_within_7_days_total: sum(dueSoon, (i) => i.due),
      due_within_7_days_count: dueSoon.length,
      paid_total: sum(paid, (i) => i.total),
      most_overdue: overdue.slice(0, 3).map(brief),
      due_soon: dueSoon.slice(0, 3).map(brief),
    },
  };
}

// Same facts give the same briefing, so we don't spend AI quota on every page load.
const cache = new Map();

export async function getBriefing(invoices) {
  const { facts, priority, hasOpen } = buildFacts(invoices);
  if (!hasOpen) {
    return { headline: "You're all caught up", points: ["No unpaid invoices right now."], priority: null };
  }
  const key = JSON.stringify(facts);
  let text = cache.get(key);
  if (!text) {
    text = await writeBriefing(facts);
    cache.set(key, text);
    if (cache.size > 50) cache.delete(cache.keys().next().value);
  }
  return { ...text, priority };
}