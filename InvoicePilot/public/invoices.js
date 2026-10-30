const q = (id) => document.getElementById(id);

function money(v, cur) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Number(v)); }
  catch { return `${v} ${cur}`; }
}

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

function totals(list, pick) {
  const by = {};
  list.forEach((i) => { by[i.currency] = (by[i.currency] || 0) + Number(pick(i) || 0); });
  const parts = Object.entries(by).map(([c, v]) => money(v, c));
  return parts.length ? parts.join(" + ") : money(0, "USD");
}

const LABEL = { paid: "Paid", open: "Awaiting payment", overdue: "Overdue", draft: "Draft", closed: "Closed" };

function renderInvoices(invoices) {
  const open = invoices.filter((i) => i.state === "open" || i.state === "overdue");
  const overdue = invoices.filter((i) => i.state === "overdue");
  const paid = invoices.filter((i) => i.state === "paid");

  q("stats").replaceChildren(
    el("div", { className: "stat" }, el("small", { textContent: "Outstanding" }), el("strong", { textContent: totals(open, (i) => i.due) })),
    el("div", { className: "stat bad" }, el("small", { textContent: `Overdue (${overdue.length})` }), el("strong", { textContent: totals(overdue, (i) => i.due) })),
    el("div", { className: "stat good" }, el("small", { textContent: "Paid" }), el("strong", { textContent: totals(paid, (i) => i.total) }))
  );

  const rows = invoices.map((inv) => {
    const badgeText = inv.state === "overdue" ? `Overdue · ${inv.daysOverdue}d` : LABEL[inv.state];
    const canRemind = (inv.state === "open" || inv.state === "overdue") && typeof openReminder === "function";
    return el("tr", {},
      el("td", { textContent: inv.number || inv.id }),
      el("td", { textContent: inv.client }),
      el("td", { textContent: money(inv.total, inv.currency) }),
      el("td", { textContent: inv.dueDate || "—" }),
      el("td", {}, el("span", { className: `badge ${inv.state}`, textContent: badgeText })),
      el("td", {}, canRemind ? el("button", { className: "ghost small", type: "button", textContent: "Remind", onclick: () => openReminder(inv) }) : "")
    );
  });
  q("invoiceBody").replaceChildren(...rows);
  q("listStatus").textContent = invoices.length ? "" : "No invoices yet. Create your first one above.";
  window.lastInvoices = invoices;
  if (typeof window.updateCalendar === "function") window.updateCalendar(invoices);
}

async function loadInvoices() {
  q("listStatus").textContent = "Loading…";
  try {
    renderInvoices((await api("/api/invoices")).invoices);
  } catch (e) {
    q("listStatus").textContent = e.message;
  }
}

q("refreshBtn").onclick = loadInvoices;
loadInvoices();