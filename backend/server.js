const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "Backend running" });
});

// List recent notes for dashboard
app.get("/api/notes", (req, res) => {
  try {
    const { participant, hasIncident } = req.query;

    let baseQuery = `
      SELECT
        id,
        participantName,
        workerName,
        date,
        startTime,
        endTime,
        location,
        incidentFlag,
        createdAt
      FROM progress_notes
    `;
    const where = [];
    const params = [];

    if (participant && participant.trim()) {
      where.push("participantName LIKE ?");
      params.push(`%${participant.trim()}%`);
    }

    if (hasIncident === "true") {
      where.push("incidentFlag = 1");
    } else if (hasIncident === "false") {
      where.push("incidentFlag = 0");
    }

    if (where.length > 0) {
      baseQuery += " WHERE " + where.join(" AND ");
    }

    baseQuery += " ORDER BY createdAt DESC LIMIT 50";

    const stmt = db.prepare(baseQuery);
    const rows = stmt.all(...params);

    return res.json({ notes: rows });
  } catch (err) {
    console.error("Error listing notes:", err.message);
    return res.status(500).json({ error: "Failed to list notes" });
  }
});

// Fetch a single note (for full view in dashboard)
app.get("/api/notes/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    const stmt = db.prepare(`
      SELECT *
      FROM progress_notes
      WHERE id = ?
    `);
    const row = stmt.get(id);

    if (!row) {
      return res.status(404).json({ error: "Note not found" });
    }

    return res.json({ note: row });
  } catch (err) {
    console.error("Error fetching note:", err.message);
    return res.status(500).json({ error: "Failed to fetch note" });
  }
});


const Database = require("better-sqlite3");

// open or create local DB file
const db = new Database("notes.db");

// create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS progress_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participantName TEXT NOT NULL,
    workerName TEXT NOT NULL,
    date TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    location TEXT NOT NULL,
    activitiesAndSupports TEXT NOT NULL,
    participantPresentation TEXT NOT NULL,
    goalsWorkedOn TEXT NOT NULL,
    incidentsOrRisks TEXT NOT NULL,
    followUpActions TEXT NOT NULL,
    noteText TEXT NOT NULL,
    incidentFlag INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );
`);


// Helper: time to minutes since midnight
const timeToMinutes = (t) => {
  if (!t || typeof t !== "string") return null;
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

// Helper: parse YYYY-MM-DD into Date at midnight
const parseYyyyMmDd = (s) => {
  if (!s || typeof s !== "string") return null;
  const [yStr, mStr, dStr] = s.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if ([y, m, d].some((n) => Number.isNaN(n))) return null;
  return new Date(y, m - 1, d);
};

// Simple junk detection
const looksLikeJunk = (text) => {
  const t = (text || "").trim();
  if (t.length < 10) return true;
  if (!t.includes(" ") && t.length < 20) return true;
  if (/^([a-zA-Z0-9]{1,3})\1{2,}$/i.test(t)) return true;
  return false;
};

// Escape helper for regex
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- Compliance filter (hybrid layer) ----
function applyComplianceFilter(noteBody, rawCombined, workerName) {
  let body = (noteBody || "").trim();

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
    body = body.replace(/the support worker[\s,]+the support worker/gi, "the support worker");
  }

  // 3) Remove / neutralise subjective, therapeutic or organisational-process phrases
  const replacements = [
    {
        // Remove sentences that restate date, time, or shift framing
        regex: /\b(the support worker|the participant)[^.]*\b(from\s+\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}|on\s+[A-Za-z]+\s+\d{1,2},\s*\d{4}|on\s+\d{4}-\d{2}-\d{2}|at\s+(his|her|their)\s+(home|residence)|at\s+\b(home|residence))[^.]*\./gi,
        replace: ""
    },
    {
      // e.g. "with persistence and patience, Ali ..."
      regex: /\bwith persistence and patience[^.]*\./gi,
      replace: "After some time, the participant began to engage in the activity."
    },
    {
      // causal mood / wellbeing statements
      // e.g. "which had a positive impact on his mood"
      regex: /\b(had|has|having|made|caused)\b[^.]*\b(positive impact|impact on (his|her|their) mood|improved (his|her|their) mood|helped (him|her|them) feel better)\b[^.]*/gi,
      replace: ""
    },
    {
      // overly therapeutic environment description
      regex: /\b(calming|therapeutic)\s+environment[^.]*/gi,
      replace: "environment"
    },
    {
      // very broad emotional wellbeing phrase
      regex: /\bemotional well[- ]?being\b/gi,
      replace: "presentation"
    },
    {
      // generic wellbeing
      regex: /\boverall well[- ]?being\b/gi,
      replace: "overall presentation"
    },
    {
      // internal process / records – remove the whole sentence fragment
      regex: /\b(this|the incident)\s+(will|has been)\s+documented in (the )?service records[^.]*/gi,
      replace: ""
    },
    {
      // "an incident report was/will be completed"
      regex: /\ban incident report (?:was|will be) completed[^.]*/gi,
      replace: ""
    },
    {
      // soften behavioural comparison
      regex: /distinct from his usual presentation/gi,
      replace: "different from how he usually presents"
    }
  ];

  replacements.forEach(({ regex, replace }) => {
    body = body.replace(regex, replace);
  });

  // 4) First-person pronouns -> third-person (simple mapping)
  const pronounRules = [
    { regex: /\bI am\b/gi, replace: "The support worker is" },
    { regex: /\bI'm\b/gi, replace: "The support worker is" },
    { regex: /\bI\b/gi, replace: "the support worker" },
    { regex: /\bmy\b/gi, replace: "the support worker's" },
    { regex: /\bwe\b/gi, replace: "the support worker and the participant" },
    { regex: /\bour\b/gi, replace: "the support worker and the participant's" },
    { regex: /\bus\b/gi, replace: "the support worker and the participant" }
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

// Generate note using Ollama
app.post("/api/generate-note", async (req, res) => {
  try {
    const {
      participantName,
      date,
      startTime,
      endTime,
      location,
      activitiesAndSupports,
      participantPresentation,
      goalsWorkedOn,
      incidentsOrRisks,
      followUpActions,
      workerName,
      incidentOccurred,
    } = req.body;

    // 1. Required field checks
    const requiredFields = {
      participantName,
      date,
      startTime,
      endTime,
      location,
      activitiesAndSupports,
      participantPresentation,
      goalsWorkedOn,
      incidentsOrRisks,
      followUpActions,
      workerName,
    };

    const missing = Object.entries(requiredFields)
      .filter(([, value]) => !value || !value.toString().trim())
      .map(([key]) => key);

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    // 2. Date sanity check (no future dates)
    const shiftDate = parseYyyyMmDd(date);
    if (!shiftDate) {
      return res.status(400).json({ error: "Invalid date format." });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    shiftDate.setHours(0, 0, 0, 0);

    if (shiftDate > today) {
      return res.status(400).json({
        error: "Date of support cannot be in the future.",
      });
    }

    // 3. Basic time sanity check (same-day, non-overnight)
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);

    console.log("DEBUG times:", { startTime, endTime, startMins, endMins });

    if (startMins === null || endMins === null) {
      return res.status(400).json({
        error: "Invalid start or end time format.",
      });
    }

    if (endMins <= startMins) {
      return res.status(400).json({
        error: "End time must be after start time for the shift.",
      });
    }

    // 4. Junk detection on key description fields
    const junkFields = [];
        if (looksLikeJunk(activitiesAndSupports)) junkFields.push("activitiesAndSupports");
        if (looksLikeJunk(participantPresentation)) junkFields.push("participantPresentation");
        if (looksLikeJunk(goalsWorkedOn)) junkFields.push("goalsWorkedOn");

        // ✅ Only enforce “not junk” for incidents if worker says an incident occurred
        if (incidentOccurred === true && looksLikeJunk(incidentsOrRisks)) {
        junkFields.push("incidentsOrRisks");
        }

        if (junkFields.length > 0) {
        return res.status(400).json({
            error:
            "Some fields do not look like meaningful descriptions. Please rewrite: " +
            junkFields.join(", "),
        });
        }

    const safeLocation = location.trim();
    const shiftTime = `${startTime}–${endTime}`;

    const rawCombined =
      (activitiesAndSupports || "") +
      " " +
      (participantPresentation || "") +
      " " +
      (goalsWorkedOn || "") +
      " " +
      (incidentsOrRisks || "") +
      " " +
      (followUpActions || "");

    // 5. Prompt for Llama 3 – BODY ONLY
    const prompt = `
You are assisting NDIS disability support workers to write professional, objective and compliant progress notes.

You will receive structured information about ONE support shift. Your task is to write the BODY of an NDIS-style progress note ONLY (no headers).

If the information is vague, gibberish, placeholder text (e.g., “asd”, “test”, “n/a”, or extremely short responses that do not describe what happened), then:
- Do NOT generate a normal note.
- Instead, return exactly:
  ERROR: Insufficient information. Please rewrite the following fields with real details.

Otherwise, generate a high-quality progress note BODY ONLY.

DATA PROVIDED:
Participant: ${participantName}
Date of Support: ${date}
Shift Time: ${shiftTime}
Location: ${safeLocation}

Raw input – Activities & Supports:
${activitiesAndSupports}

Raw input – Participant Presentation (mood/behaviour/health/communication):
${participantPresentation}

Raw input – Goals Worked On:
${goalsWorkedOn}

Raw input – Incidents, Risks, Changes:
${incidentsOrRisks}

Raw input – Follow-up / Next Steps:
${followUpActions}

Support worker: ${workerName}

-----------------------------------------------------------
STYLE, FORMAT & SAFETY RULES
-----------------------------------------------------------

1) Write STRICTLY in third-person.
   - Use “the support worker”, “the participant”, or their name.
   - NEVER use “I”, “we”, “my”, “our”.

2) Be FACTUAL and OBSERVABLE.
   - Describe what occurred, what was observed, and what the support worker did.
   - Do NOT describe internal thoughts or feelings unless explicitly stated in the input.

3) ONLY use mood/affect words that appear in the raw input.
   - Do NOT add new emotional labels (e.g., anxious, calm, distressed, comfortable, supported) unless written in the input.

4) NDIS goal linkage must be FUNCTIONAL.
   - Focus on things like community access, daily living skills, participation, communication, engagement.

5) Incident documentation must be clear and neutral.
   - What happened, immediate impact, what the support worker did, whether the participant continued the activity.
   - Do NOT say an incident report was completed unless stated in the input.

6) ALWAYS include a follow-up / next-shift paragraph at the end.
   - Even if minimal. e.g., “For the next shift, staff should…”

7) Do NOT write any introductory phrases like:
   - “Here is the note”
   - “This progress note describes…”
   Start directly with the first paragraph.

8) Do NOT restate date, location or shift time inside the body.
   - Do NOT write sentences like:
     - "The support worker accompanied [name] on a shift from 10:00 to 13:00 at [location] on [date]."
     - "The shift took place at [location] on [date]."
   - You can mention places (e.g., "at home", "at the shopping centre") when describing activities,
     but do NOT repeat the exact shift time or date from the header.


-----------------------------------------------------------
REQUIRED OUTPUT STRUCTURE
-----------------------------------------------------------

Write 2–4 paragraphs in this order:

1) Supports Provided – activities completed and where they occurred.
2) Participant Presentation – mood/behaviour/engagement as described in the input.
3) Goals – link activities to NDIS functional goals.
4) Incidents + Follow-up – any incidents/risks + clear follow-up actions or monitoring.

OUTPUT ONLY THE BODY TEXT.
NO HEADERS.
NO TITLES.
NO INTRO LINES.
`;

    const ollamaResponse = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "llama3",
        prompt,
        stream: false,
      }
    );

    let modelText = (ollamaResponse.data.response || "").trim();

    // If model followed the "ERROR:" contract
    if (modelText.startsWith("ERROR:")) {
      return res.status(400).json({ error: modelText });
    }

    // Apply hybrid compliance filter
    const filteredBody = applyComplianceFilter(modelText, rawCombined, workerName);

    // Header (non-AI)
    const header = [
      `Support Worker: ${workerName}`,
      `Date of Support: ${date}`,
      `Shift Time: ${shiftTime}`,
      `Location: ${safeLocation}`,
      `Participant: ${participantName}`,
    ].join("\n");

    const fullNote = `${header}\n\n${filteredBody}`;

    // naïve incident flag: true if worker didn't literally say "no incidents" etc.
    const incidentText = (incidentsOrRisks || "").toLowerCase();
    const incidentFlag =
    incidentText.trim().length > 0 &&
    !incidentText.includes("no incident") &&
    !incidentText.includes("no incidents") &&
    !incidentText.includes("no concerns");

    const insertStmt = db.prepare(`
    INSERT INTO progress_notes (
        participantName,
        workerName,
        date,
        startTime,
        endTime,
        location,
        activitiesAndSupports,
        participantPresentation,
        goalsWorkedOn,
        incidentsOrRisks,
        followUpActions,
        noteText,
        incidentFlag,
        createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
    participantName,
    workerName,
    date,
    startTime,
    endTime,
    safeLocation,
    activitiesAndSupports,
    participantPresentation,
    goalsWorkedOn,
    incidentsOrRisks,
    followUpActions,
    fullNote,
    incidentFlag ? 1 : 0,
    new Date().toISOString()
    );


    return res.json({ note: fullNote });
  } catch (error) {
    console.error("Error generating note:", error.message);
    return res.status(500).json({ error: "Failed to generate note" });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
