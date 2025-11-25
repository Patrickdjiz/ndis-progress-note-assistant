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
    } = req.body;

    // ---------- Helpers ----------
    const timeToMinutes = (t) => {
      if (!t || typeof t !== "string") return null;
      const [hStr, mStr] = t.split(":");
      const h = Number(hStr);
      const m = Number(mStr);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return h * 60 + m;
    };

    const parseYyyyMmDd = (s) => {
      if (!s || typeof s !== "string") return null;
      const [yStr, mStr, dStr] = s.split("-");
      const y = Number(yStr);
      const m = Number(mStr);
      const d = Number(dStr);
      if ([y, m, d].some((n) => Number.isNaN(n))) return null;
      return new Date(y, m - 1, d);
    };

    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // ---------- 1. Required field checks ----------
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

    // ---------- 2. Date sanity check (no future dates) ----------
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

    // ---------- 3. Time sanity check ----------
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

    // ---------- 4. Simple junk detection ----------
    const looksLikeJunk = (text) => {
      const t = text.trim();
      if (t.length < 10) return true;
      if (!t.includes(" ") && t.length < 20) return true;
      if (/^([a-zA-Z0-9]{1,3})\1{2,}$/i.test(t)) return true;
      return false;
    };

    const junkFields = [];
    if (looksLikeJunk(activitiesAndSupports)) junkFields.push("activitiesAndSupports");
    if (looksLikeJunk(participantPresentation)) junkFields.push("participantPresentation");
    if (looksLikeJunk(goalsWorkedOn)) junkFields.push("goalsWorkedOn");

    if (junkFields.length > 0) {
      return res.status(400).json({
        error:
          "Some fields do not look like meaningful descriptions. Please rewrite: " +
          junkFields.join(", "),
      });
    }

    const safeLocation = location.trim();
    const shiftTime = `${startTime}–${endTime}`;

    // ---------- 5. Prompt for Llama 3 – BODY ONLY ----------
    const prompt = `
You are assisting NDIS disability support workers to write professional, objective and compliant progress notes.

You will receive structured information about ONE support shift. Your task is to write the BODY of an NDIS-style progress note ONLY (no headers).

If the information is vague, gibberish, placeholder text (e.g., “asd”, “test”, “n/a”, or extremely short responses that do not describe what happened), then:
- Do NOT generate a normal note.
- Instead, return exactly:
  ERROR: Insufficient information. Please rewrite the following fields with real details: [list fields].

If the information is valid, generate a high-quality progress note BODY ONLY.

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
   - Do NOT describe internal feelings or thoughts unless explicitly stated in the input.

3) NO invented emotional states.
   - ONLY use mood/affect words that appear in the raw input.
   - Do NOT add terms like “anxious”, “calm”, “distressed”, “comfortable”, “supported”, “relaxed”, “overwhelmed”, “well-being”, etc., unless written in the input.

4) NO emotional-effect statements.
   - Do not write phrases like “helped him feel calm”, “allowed her to feel supported”, “improved his overall well-being”.
   - Only describe observable changes already listed by the worker.

5) NDIS goal linkage must be FUNCTIONAL.
   Allowed examples (if mentioned or implied):
   - community access
   - daily living skills
   - engagement
   - communication
   - participation

6) Incident documentation must be clear and neutral.
   When an incident occurs, describe:
   - what happened
   - immediate impact (if any)
   - what the support worker did in response
   - whether the participant continued the activity.

   NEVER state that an incident report was completed unless the input says so.

7) ALWAYS include a follow-up / next-shift paragraph at the end.

8) ABSOLUTELY NO INTRODUCTORY SENTENCES.
   Do NOT write:
   - “Here is the note”
   - “Below is the summary”
   Start directly with the first paragraph of the note.

9) Do NOT restate the exact date, start time or end time inside the body.
   These appear only in the header.

-----------------------------------------------------------
REQUIRED OUTPUT STRUCTURE
-----------------------------------------------------------

Write 2–4 paragraphs in this order:

1) Supports Provided – activities completed and where.
2) Participant Presentation – mood/behaviour/engagement (only from input).
3) Goals – link activities to functional NDIS goals.
4) Incidents + Follow-up – factual summary + response + next-shift focus.

OUTPUT ONLY THE BODY TEXT.
NO HEADERS.
NO TITLES.
NO INTRO LINES.
    `.trim();

    const ollamaResponse = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "llama3",
        prompt,
        stream: false,
      }
    );

    let modelText = (ollamaResponse.data.response || "").trim();

    if (modelText.startsWith("ERROR:")) {
      return res.status(400).json({ error: modelText });
    }

    // ---------- 6. Hybrid post-processing on BODY ----------
    let noteBody = modelText;

    // a) Strip classic intro lines if the model ignores instructions
    const lines = noteBody.split("\n");
    const cleanedLines = lines.filter((line, index) => {
      const trimmed = line.trim().toLowerCase();
      if (index === 0 && trimmed.startsWith("here is")) return false;
      if (trimmed.startsWith("here is the written progress note")) return false;
      if (trimmed.startsWith("here is the body of the note")) return false;
      if (trimmed.startsWith("below is")) return false;
      return true;
    });
    noteBody = cleanedLines.join("\n").trim();

    // b) Replace support worker's name with "the support worker"
    const workerNameRegex = new RegExp(escapeRegExp(workerName), "g");
    noteBody = noteBody.replace(workerNameRegex, "the support worker");

    // c) Fix accidental duplication: "the support worker the support worker"
    noteBody = noteBody.replace(/the support worker the support worker/gi, "the support worker");

    // d) Scrub explicit date & times from body (they are in the header already)
    const rawCombined =
      (
        activitiesAndSupports +
        " " +
        participantPresentation +
        " " +
        goalsWorkedOn +
        " " +
        incidentsOrRisks +
        " " +
        followUpActions
      ).toLowerCase();

    const shiftDateObj = parseYyyyMmDd(date);
    if (shiftDateObj) {
      const y = shiftDateObj.getFullYear();
      const mIdx = shiftDateObj.getMonth();
      const d = shiftDateObj.getDate();
      const monthNames = [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December"
      ];
      const longDate = `${monthNames[mIdx]} ${d}, ${y}`;

      // Remove ISO and long form
      noteBody = noteBody.replace(new RegExp(`\\b${escapeRegExp(date)}\\b`, "g"), "");
      noteBody = noteBody.replace(new RegExp(`\\b${escapeRegExp(longDate)}\\b`, "g"), "");
    }

    // Remove explicit time ranges (from 03:39 to 10:39 etc.)
    const timeRangePatterns = [
      new RegExp(`from\\s+${escapeRegExp(startTime)}\\s+to\\s+${escapeRegExp(endTime)}`, "gi"),
      new RegExp(`${escapeRegExp(startTime)}\\s*–\\s*${escapeRegExp(endTime)}`, "g"),
    ];
    timeRangePatterns.forEach((re) => {
      noteBody = noteBody.replace(re, "");
    });

    // Remove standalone times if they still appear
    [startTime, endTime].forEach((t) => {
      const re = new RegExp(`\\b${escapeRegExp(t)}\\b`, "g");
      noteBody = noteBody.replace(re, "");
    });

    // e) Very simple first-person fix: replace leading "I ..." with "The support worker ..."
    // This keeps things in third person even if grammar is slightly clunky.
    noteBody = noteBody.replace(/(^|\.\s+)I\s+/g, "$1The support worker ");

    // f) Clean up sensitive mental-health labels not in raw input
    const sensitiveTerms = [
      "psychosis",
      "psychotic",
      "ptsd",
      "panic attack",
      "suicidal",
      "suicidality",
    ];

    sensitiveTerms.forEach((term) => {
      if (noteBody.toLowerCase().includes(term) && !rawCombined.includes(term)) {
        const termRegex = new RegExp(`\\b${term}\\b`, "gi");
        noteBody = noteBody.replace(termRegex, "emotional wellbeing");
      }
    });

    // g) Remove some emotional-effect phrases if model still sneaks them in
    const emotionalEffects = [
      "allowed him to feel",
      "allowed her to feel",
      "allowed them to feel",
      "helped him feel",
      "helped her feel",
      "helped them feel",
      "promoted well-being",
      "promoted wellbeing",
      "promotes well-being",
      "supports well-being",
      "overall well-being",
      "overall wellbeing",
      "felt supported",
      "feel supported",
      "felt comfortable",
      "feel comfortable",
    ];

    emotionalEffects.forEach((phrase) => {
      const re = new RegExp(escapeRegExp(phrase), "gi");
      if (re.test(noteBody)) {
        noteBody = noteBody.replace(re, "supported routine engagement");
      }
    });

    // h) Final tidy-up: collapse extra spaces
    noteBody = noteBody.replace(/\s{2,}/g, " ").replace(/\s+\n/g, "\n").trim();

    // ---------- 7. Prepend standard header ----------
    const header = [
      `Support Worker: ${workerName}`,
      `Date of Support: ${date}`,
      `Shift Time: ${shiftTime}`,
      `Location: ${safeLocation}`,
      `Participant: ${participantName}`,
    ].join("\n");

    const fullNote = `${header}\n\n${noteBody}`;

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
