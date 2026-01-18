// src/lib/dateFormat.js
export const TZ = "Australia/Sydney";

export const fmtShiftDate = (yyyyMmDd) => {
  if (!yyyyMmDd) return "-";
  const ymd = String(yyyyMmDd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return String(yyyyMmDd);

  // midday UTC avoids DST / timezone edge issues
  const dt = new Date(`${ymd}T12:00:00.000Z`);

  return dt.toLocaleDateString("en-AU", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const fmtHm = (t) => (t ? String(t).slice(0, 5) : "-");

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

