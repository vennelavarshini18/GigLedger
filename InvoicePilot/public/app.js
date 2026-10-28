const $ = (id) => document.getElementById(id);

function setStatus(msg, isError = false) {
  $("status").textContent = msg;
  $("status").className = isError ? "error" : "";
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function addItemRow(item = { description: "", quantity: 1, unit_price: 0, unit: "units" }) {
  const row = document.createElement("div");
  row.className = "item";
  row.dataset.unit = item.unit;
  const mk = (cls, type, value, ph) => {
    const el = document.createElement("input");
    el.className = cls; el.type = type; el.value = value; el.placeholder = ph;
    if (type === "number") { el.min = "0"; el.step = "any"; }
    el.addEventListener("input", updateTotal);
    return el;
  };
  const del = document.createElement("button");
  del.className = "x"; del.textContent = "✕"; del.type = "button";
  del.onclick = () => { row.remove(); updateTotal(); };
  row.append(mk("desc", "text", item.description, "Description"),
             mk("qty", "number", item.quantity, "Qty"),
             mk("price", "number", item.unit_price, "Price"), del);
  $("items").append(row);
}

function updateTotal() {
  let t = 0;
  document.querySelectorAll(".item").forEach((r) => {
    t += (Number(r.querySelector(".qty").value) || 0) * (Number(r.querySelector(".price").value) || 0);
  });
  $("total").textContent = t.toFixed(2) + " " + $("currency").value;
}

function renderReview(d) {
  $("client_name").value = d.client_name || "";
  $("client_email").value = d.client_email || "";
  $("currency").value = d.currency || "USD";
  $("due_in_days").value = d.due_in_days ?? 14;
  $("notes").value = d.notes || "";
  $("items").replaceChildren();
  (d.items?.length ? d.items : [undefined]).forEach((i) => addItemRow(i));
  const warn = $("warnings");
  warn.replaceChildren();
  if (d.missing_fields?.length || d.confidence !== "high") {
    const div = document.createElement("div");
    div.className = "warn";
    div.textContent = `AI confidence: ${d.confidence}.` +
      (d.missing_fields?.length ? ` Please check: ${d.missing_fields.join(", ")}.` : "");
    warn.append(div);
  }
  $("review").classList.remove("hidden");
  $("result").classList.add("hidden");
  updateTotal();
}

function readDraft() {
  return {
    client_name: $("client_name").value,
    client_email: $("client_email").value,
    currency: $("currency").value,
    due_in_days: Number($("due_in_days").value) || 0,
    notes: $("notes").value,
    items: [...document.querySelectorAll(".item")].map((r) => ({
      description: r.querySelector(".desc").value,
      quantity: Number(r.querySelector(".qty").value),
      unit_price: Number(r.querySelector(".price").value),
      unit: r.dataset.unit,
    })),
  };
}

function showResult(inv) {
  const box = $("result");
  box.replaceChildren();
  const h = document.createElement("h2");
  h.textContent = "Invoice sent ✅";
  const p = document.createElement("p");
  p.textContent = `Invoice ${inv.number || inv.id} for ${inv.total} ${inv.currency} is ${inv.status}.`;
  box.append(h, p);
  if (inv.payUrl) {
    const a = document.createElement("a");
    a.className = "pay"; a.href = inv.payUrl; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "Open the client's payment page →";
    box.append(a);
  }
  box.classList.remove("hidden");
}

$("addItem").onclick = () => addItemRow();
$("currency").onchange = updateTotal;

$("parseBtn").onclick = async () => {
  const text = $("note").value.trim();
  if (!text) return setStatus("Write a note first.", true);
  $("parseBtn").disabled = true;
  setStatus("Reading your note…");
  try {
    renderReview((await api("/api/parse", { text })).draft);
    setStatus("");
  } catch (e) { setStatus(e.message, true); }
  $("parseBtn").disabled = false;
};

$("sendBtn").onclick = async () => {
  $("sendBtn").disabled = true;
  setStatus("Creating and sending your invoice on PayPal…");
  try {
    showResult((await api("/api/invoices", { draft: readDraft() })).invoice);
    loadInvoices();
    if (typeof loadBriefing === "function") loadBriefing();
    setStatus("");
  } catch (e) { setStatus(e.message, true); }
  $("sendBtn").disabled = false;
};