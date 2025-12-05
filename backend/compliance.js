// compliance.js

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Compliance filter (hybrid layer) ----
function applyComplianceFilter(noteBody, rawCombined, workerName) {
  let body = (noteBody || "").trim();

  // A) Remove full sentences that restate date/time explicitly
  body = body.replace(
    /\b(on\s+\d{4}-\d{2}-\d{2}|on\s+[A-Z][a-z]+\s+\d{1,2},\s*\d{4}|from\s+\d{1,2}:\d{2}\s*(?:–|-)\s*\d{1,2}:\d{2})[^.]*\./gi,
    ""
  );

  // B) Strip any remaining bare time/date fragments inside sentences
  body = body.replace(
    /\bfrom\s+\d{1,2}:\d{2}\s*(?:–|-)\s*\d{1,2}:\d{2}\b/gi,
    ""
  );
  body = body.replace(/\bon\s+\d{4}-\d{2}-\d{2}\b/gi, "");

  // 1) Drop obvious intro lines
  const lines = body.split("\n").filter((line, idx) => {
    const t = line.trim().toLowerCase();
    if (idx === 0 && t.startsWith("here is")) return false;
    if (t.startsWith("here is the written progress note")) return false;
    if (t.startsWith("here is the body")) return false;
    if (t.startsWith("below is")) return false;
    if (t.startsWith("i'm ready to assist")) return false;
    return true;
  });
  body = lines.join("\n").trim();

  // 2) Replace worker name with "the support worker"
  if (workerName && workerName.trim()) {
    const workerNameRegex = new RegExp(escapeRegExp(workerName), "gi");
    body = body.replace(workerNameRegex, "the support worker");
    // Fix duplicated "the support worker the support worker"
    body = body.replace(
      /the support worker[\s,]+the support worker/gi,
      "the support worker"
    );
  }

  // 3) Remove / neutralise subjective, therapeutic or organisational-process phrases
  const replacements = [
    {
      regex: /\b(the support worker|the participant)[^.]*\b(from\s+\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}|on\s+[A-Za-z]+\s+\d{1,2},\s*\d{4}|on\s+\d{4}-\d{2}-\d{2}|at\s+(his|her|their)\s+(home|residence)|at\s+\b(home|residence))[^.]*\./gi,
      replace: ""
    },
    {
      regex: /\bwith persistence and patience[^.]*\./gi,
      replace:
        "After some time, the participant began to engage in the activity."
    },
    {
      regex: /\b(had|has|having|made|caused)\b[^.]*\b(positive impact|impact on (his|her|their) mood|improved (his|her|their) mood|helped (him|her|them) feel better)\b[^.]*/gi,
      replace: ""
    },
    {
      regex: /\b(calming|therapeutic)\s+environment[^.]*/gi,
      replace: "environment"
    },
    {
      regex: /\bemotional well[- ]?being\b/gi,
      replace: "presentation"
    },
    {
      regex: /\boverall well[- ]?being\b/gi,
      replace: "overall presentation"
    },
    {
      regex: /\b(this|the incident)\s+(will|has been)\s+documented in (the )?service records[^.]*/gi,
      replace: ""
    },
    {
      regex: /\ban incident report (?:was|will be) completed[^.]*/gi,
      replace: ""
    },
    {
      regex: /distinct from his usual presentation/gi,
      replace: "different from how he usually presents"
    }
  ];

  replacements.forEach(({ regex, replace }) => {
    body = body.replace(regex, replace);
  });

  // 4) First-person pronouns -> third-person
  const pronounRules = [
    { regex: /\bI am\b/gi, replace: "The support worker is" },
    { regex: /\bI'm\b/gi, replace: "The support worker is" },
    { regex: /\bI\b/gi, replace: "the support worker" },
    { regex: /\bmy\b/gi, replace: "the support worker's" },
    { regex: /\bwe\b/gi, replace: "the support worker and the participant" },
    {
      regex: /\bour\b/gi,
      replace: "the support worker and the participant's"
    },
    {
      regex: /\bus\b/gi,
      replace: "the support worker and the participant"
    }
  ];
  pronounRules.forEach(({ regex, replace }) => {
    body = body.replace(regex, replace);
  });

  // 5) Remove extra blank lines + tidy spaces
  body = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n\n");

  return body.trim();
}

module.exports = applyComplianceFilter;
