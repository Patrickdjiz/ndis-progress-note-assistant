// backend/clientIp.js
function looksLikeIp(v) {
  if (!v) return false;
  const s = String(v).trim();
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return true;
  // IPv6 (loose check)
  if (/^[0-9a-fA-F:]+$/.test(s) && s.includes(":")) return true;
  return false;
}

function getClientIp(req) {
  // Fly edge header (best signal when running on Fly)
  const fly = req.get("fly-client-ip");
  if (looksLikeIp(fly)) return fly.trim();

  // Cloudflare header (when proxied through CF)
  const cf = req.get("cf-connecting-ip");
  if (looksLikeIp(cf)) return cf.trim();

  // Standard proxy header (first hop)
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") {
    const first = xff.split(",")[0].trim();
    if (looksLikeIp(first)) return first;
  }

  return looksLikeIp(req.ip) ? req.ip : null;
}

module.exports = { getClientIp };
