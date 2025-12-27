// src/lib/dateFormat.js
export const TZ = "Australia/Brisbane";

// For shift dates stored as YYYY-MM-DD (Postgres DATE)
export const fmtShiftDate = (yyyyMmDd) => {
  if (!yyyyMmDd) return "-";

  const s = String(yyyyMmDd).slice(0, 10);
  const parts = s.split("-");
  if (parts.length !== 3) return String(yyyyMmDd);

  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return String(yyyyMmDd);

  // Build local date to avoid timezone shifting
  const dt = new Date(y, m - 1, d);

  return dt.toLocaleDateString("en-AU", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// For ISO timestamps like 2025-12-27T05:59:32.015Z
export const fmtDateTime = (iso) => {
  if (!iso) return "";

  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return String(iso);

  return dt.toLocaleString("en-AU", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    // If you want AEST:
    // timeZoneName: "short",
  });
};
