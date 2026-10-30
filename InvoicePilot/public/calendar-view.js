const host = document.getElementById("calendarHost");
const statusEl = document.getElementById("calStatus");

let Calendar;
try {
  ({ Calendar } = await import("/vendor/bryntum/calendar.module.js"));
} catch (e) {
  console.error("Bryntum Calendar failed to load:", e);
  statusEl.textContent = "The calendar view is unavailable right now. The invoice table below shows the same information.";
}

if (Calendar) {
  const COLORS = { paid: "#049b0b", open: "#005bc2", overdue: "#c80303" };
  const byId = new Map();

  const parseDay = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  function toEvents(invoices) {
    byId.clear();
    return invoices
      .filter((i) => i.dueDate && COLORS[i.state])
      .map((i) => {
        byId.set(String(i.id), i);
        const start = parseDay(i.dueDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return {
          id: i.id,
          name: `${i.client} · ${money(i.total, i.currency)}`,
          startDate: start,
          endDate: end,
          allDay: true,
          eventColor: COLORS[i.state],
          cls: `calendar-event-${i.state}`,
          readOnly: true,
          draggable: false,
          resizable: false,
        };
      });
  }

  const calendar = new Calendar({
    appendTo: host,
    height: 520,
    date: new Date(),
    mode: "month",
    sidebar: false,
    autoCreate: false,
    modes: { day: false, year: false },
    features: { eventEdit: null, drag: null },
    events: [],
    listeners: {
      eventClick({ eventRecord }) {
        const inv = byId.get(String(eventRecord.id));
        if (!inv) return;
        const label = inv.state === "overdue"
          ? `overdue by ${inv.daysOverdue} days`
          : inv.state === "paid"
            ? "paid"
            : "awaiting payment";
        statusEl.textContent = `Invoice ${inv.number || inv.id} · ${inv.client} · ${money(inv.total, inv.currency)} · ${label}`;
        if ((inv.state === "open" || inv.state === "overdue") && typeof openReminder === "function") {
          openReminder(inv);
        }
      },
    },
  });

  window.updateCalendar = (invoices) => {
    calendar.eventStore.data = toEvents(invoices);
  };

  if (window.lastInvoices) window.updateCalendar(window.lastInvoices);
}
