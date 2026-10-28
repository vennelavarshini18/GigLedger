async function loadBriefing() {
  q("briefStatus").textContent = "AI is reading your invoices…";
  try {
    const b = await api("/api/insights");
    q("briefHead").textContent = b.headline;
    q("briefPoints").replaceChildren(...b.points.map((p) => el("li", { textContent: p })));
    const btn = q("briefAction");
    if (b.priority && typeof openReminder === "function") {
      btn.textContent = `Draft reminder for ${b.priority.client}`;
      btn.onclick = () => openReminder(b.priority);
      btn.classList.remove("hidden");
    } else {
      btn.classList.add("hidden");
    }
    q("briefStatus").textContent = "";
  } catch (e) {
    q("briefStatus").textContent = e.message;
  }
}

q("refreshBtn").addEventListener("click", loadBriefing);
loadBriefing();