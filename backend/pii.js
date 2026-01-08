// backend/pii.js

function redactPII(input) {
  const s = String(input || "");

  // Emails
  let out = s.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "[email]"
  );

  // Phone-like patterns (best-effort)
  out = out.replace(
    /(\+?\d[\d\s().-]{7,}\d)/g,
    "[phone]"
  );

  // Long digit sequences (IDs)
  out = out.replace(/\b\d{8,}\b/g, "[id]");

  return out;
}

module.exports = { redactPII };
