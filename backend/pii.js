// backend/pii.js

function redactPII(input) {
  let out = String(input || "");
  if (!out) return out;

  // Emails
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]");

  // AU phone-like patterns (best-effort; avoids catching short times)
  out = out.replace(
    /\b(?:\+?61\s?)?(?:0?[23478])(?:[\s()-]*\d){8}\b/g,
    "[phone]"
  );
  out = out.replace(/\b04(?:[\s()-]*\d){8}\b/g, "[phone]"); // mobiles like 04xx xxx xxx

  // DOB / Date of Birth (label-based to avoid removing incident dates)
  out = out.replace(
    /\b(?:DOB|D\.O\.B\.|Date of Birth|Birth\s*Date|Born)\s*[:\-]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
    "[dob]"
  );

  // Medicare-ish / long identifiers (keeps your existing generic ID too)
  // Medicare card often appears as 10 digits with spaces + optional IRN
  out = out.replace(/\b(?:medicare|mc)\s*[:\-]?\s*(\d[\d\s]{8,}\d)(?:\s*\d)?\b/gi, "[medicare]");
  out = out.replace(/\bNDIS\s*(?:number|no\.?|#)?\s*[:\-]?\s*\d{6,12}\b/gi, "[ndis-id]");

  // Street address (best-effort)
  out = out.replace(
    /\b\d{1,5}\s+[A-Z0-9][A-Z0-9.\-'\s]{2,}\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Crescent|Cres|Boulevard|Blvd|Parade|Pde|Terrace|Tce)\b/gi,
    "[address]"
  );

  // AU state + postcode
  out = out.replace(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*\d{4}\b/g, "[state-postcode]");

  // Long digit sequences (IDs)
  out = out.replace(/\b\d{8,}\b/g, "[id]");

  return out;
}

module.exports = { redactPII };
