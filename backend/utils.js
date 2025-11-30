// utils.js

// Helper: time to minutes since midnight
function timeToMinutes(t) {
  if (!t || typeof t !== "string") return null;
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Helper: parse YYYY-MM-DD into Date at midnight
function parseYyyyMmDd(s) {
  if (!s || typeof s !== "string") return null;
  const [yStr, mStr, dStr] = s.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if ([y, m, d].some((n) => Number.isNaN(n))) return null;
  return new Date(y, m - 1, d);
}

// Simple junk detection
function looksLikeJunk(text) {
  const t = (text || "").trim();
  if (t.length < 10) return true;
  if (!t.includes(" ") && t.length < 20) return true;
  if (/^([a-zA-Z0-9]{1,3})\1{2,}$/i.test(t)) return true;
  return false;
}

module.exports = {
  timeToMinutes,
  parseYyyyMmDd,
  looksLikeJunk,
};
