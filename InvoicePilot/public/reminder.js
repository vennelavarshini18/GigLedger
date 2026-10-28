let currentInvoice = null;

function setRm(msg, isError = false) {
  q("rmMsg").textContent = msg;
  q("rmMsg").className = isError ? "error" : "";
}

function rmBusy(busy) {
  ["rmSend", "rmMail", "rmCopy", "rmTone"].forEach((id) => (q(id).disabled = busy));
}

function openReminder(inv) {
  currentInvoice = inv;
  q("rmTitle").textContent = `Reminder for invoice ${inv.number || inv.id}`;
  q("rmMeta").textContent = `${inv.client} · ${money(inv.due, inv.currency)} due ${inv.dueDate || "n/a"}`;
  q("rmSubject").value = "";
  q("rmBody").value = "";
  q("rmHint").textContent = "";
  setRm("");
  q("remindDialog").showModal();
  writeReminder(null);
}

async function writeReminder(tone) {
  setRm("AI is writing your reminder…");
  rmBusy(true);
  try {
    const r = await api(`/api/invoices/${encodeURIComponent(currentInvoice.id)}/reminder-draft`, { tone });
    q("rmTone").value = r.tone;
    q("rmHint").textContent = r.invoice.daysOverdue > 0
      ? `${r.invoice.daysOverdue} days overdue. Suggested tone: ${r.suggestedTone}.`
      : "Not overdue yet, so a friendly heads-up works best.";
    q("rmSubject").value = r.draft.subject;
    q("rmBody").value = r.draft.message;
    setRm("");
  } catch (e) {
    setRm(e.message, true);
  }
  rmBusy(false);
}

q("rmTone").onchange = () => writeReminder(q("rmTone").value);
q("rmClose").onclick = () => q("remindDialog").close();

q("rmSend").onclick = async () => {
  rmBusy(true);
  setRm("Sending through PayPal…");
  try {
    await api(`/api/invoices/${encodeURIComponent(currentInvoice.id)}/remind`, {
      subject: q("rmSubject").value,
      note: q("rmBody").value,
    });
    setRm("Reminder sent through PayPal ✅");
  } catch (e) {
    setRm(e.message, true);
  }
  rmBusy(false);
};

q("rmCopy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(`${q("rmSubject").value}\n\n${q("rmBody").value}`);
    setRm("Copied to clipboard.");
  } catch {
    setRm("Could not copy. Select the text and copy it manually.", true);
  }
};

q("rmMail").onclick = () => {
  const to = currentInvoice?.email || "";
  const url =
    "https://mail.google.com/mail/?view=cm&fs=1" +
    `&to=${encodeURIComponent(to)}` +
    `&su=${encodeURIComponent(q("rmSubject").value)}` +
    `&body=${encodeURIComponent(q("rmBody").value)}`;
  window.open(url, "_blank", "noopener");
};