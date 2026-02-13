// src/lib/dateFormat.js
export const TZ = "Australia/Sydney";

export function fmtDateTimeTz(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  // Example: "06 Jan 2026, 6:52 pm AEDT"
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(d);
}

// If you still want the old behaviour elsewhere, keep fmtDateTime as-is
export function fmtDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
