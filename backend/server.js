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
    } = req.body;

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

    // 4. Simple junk detection
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

    // 5. Prompt for Llama 3 – BODY ONLY
    const prompt = `
You are assisting NDIS disability support workers to write professional, objective and compliant progress notes.

You have ALREADY received all structured information about ONE support shift below.
Your task is to write the BODY of an NDIS-style progress note ONLY (no headers).
DO NOT ask for more input. Either:
- return a valid progress note body, OR
- return a single line starting with "ERROR:" as described below.

If the information is vague, gibberish, placeholder text (e.g., "asd", "test", "n/a", or extremely short responses that do not describe what happened), then:
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
   - Use "the support worker", "the participant", or their name.
   - NEVER use "I", "we", "my", "our".

2) Be FACTUAL and OBSERVABLE.
   - Describe what occurred, what was observed, and what the support worker did.
   - Do NOT describe internal feelings or thoughts unless explicitly stated in the input.

3) NO invented emotional states.
   - ONLY use mood/affect words that appear in the raw input.
   - Do NOT add terms like "anxious", "calm", "distressed", "comfortable", "supported", "relaxed",
     "overwhelmed", "well-being", etc., unless written in the input.
   - If the input says "stressed", you may say "the participant appeared stressed". Do NOT expand into
     "anxious", "emotionally dysregulated", etc.

4) NO emotional-effect statements.
   - Banned examples: "helped him feel calm", "allowed him to feel supported", "promoted well-being",
     "improved his mood".
   - Only describe OBSERVABLE changes already listed by the worker.

5) NDIS goal linkage must be FUNCTIONAL.
   Allowed examples (functional):
   - community access
   - daily living skills
   - engagement
   - communication
   - participation
   - emotional regulation (ONLY if stated)

   Do NOT generalise goals to "overall wellbeing" or "health improvement".

6) Incident documentation must be clear and neutral.
   When an incident occurs, describe:
   - what happened
   - immediate impact (if any)
   - what the support worker did in response (check, assist, offer support)
   - the participant’s ability to continue activities

   NEVER write that an incident report was completed unless explicitly stated.

7) ALWAYS include a follow-up / next-shift paragraph at the end.
   Even if minimal (e.g. what to monitor next shift).

8) ABSOLUTELY NO INTRODUCTORY SENTENCES.
   Do NOT write:
   - "Here is the note"
   - "Below is the summary"
   - "This progress note describes..."

   Start directly with the first paragraph:
   "During this shift, the support worker..."

9) Do NOT restate date, location or shift time inside the body.
   These appear in the header.

-----------------------------------------------------------
REQUIRED OUTPUT STRUCTURE
-----------------------------------------------------------

Write 2–4 paragraphs in this order:

1) Supports Provided – describe the activities completed and where they occurred.
2) Participant Presentation – mood/behaviour/engagement EXACTLY as stated (no expansions).
3) Goals – link activities to NDIS functional goals without adding new intentions or emotional interpretations.
4) Incidents + Follow-up – factual summary + worker response, and ALWAYS end with follow-up / handover.

-----------------------------------------------------------

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

    if (modelText.startsWith("ERROR:")) {
      return res.status(400).json({ error: modelText });
    }

    // 6. SELF-CLEAN THE BODY (Option C)

    let noteBody = modelText;

    // a) Strip any intro lines like "Here is the written progress note BODY:"
    const lines = noteBody.split("\n");
    const cleanedLines = lines.filter((line, index) => {
      const trimmed = line.trim().toLowerCase();
      if (index === 0 && trimmed.startsWith("here is") && trimmed.includes("body")) {
        return false; // drop first intro line
      }
      if (trimmed.startsWith("here is the written progress note")) return false;
      if (trimmed.startsWith("here is the body of the note")) return false;
      if (trimmed.startsWith("below is")) return false;
      return true;
    });
    noteBody = cleanedLines.join("\n").trim();

    // b) Replace any explicit use of the worker's name in the body with "the support worker"
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const workerNameRegex = new RegExp(escapeRegExp(workerName), "g");
    noteBody = noteBody.replace(workerNameRegex, "the support worker");

    // c) Clean up heavy mental-health labels if not in raw input
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

    const sensitiveTerms = [
      "anxiety",
      "anxious",
      "depression",
      "depressed",
      "suicidal",
      "psychosis",
      "psychotic",
      "ptsd",
      "panic attack",
    ];

    sensitiveTerms.forEach((term) => {
      if (noteBody.toLowerCase().includes(term) && !rawCombined.includes(term)) {
        const termRegex = new RegExp(`\\b${term}\\b`, "gi");
        // Replace with more neutral phrase
        noteBody = noteBody.replace(termRegex, "emotional wellbeing");
      }
    });

    // d) Remove emotional-effect phrases not supported by input
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
    "supported his well-being",
    "supported her well-being",
    "overall well-being",
    "overall wellbeing",
    "feel comfortable",
    "felt comfortable",
    "feel supported",
    "felt supported",
    "calm and structured environment",
    "enabling him to feel",
    "enabling her to feel",
    "enabling them to feel",
    ];

    emotionalEffects.forEach((phrase) => {
    const regex = new RegExp(phrase, "gi");
    if (noteBody.toLowerCase().includes(phrase.toLowerCase())) {
        noteBody = noteBody.replace(regex, "supported routine engagement");
    }
    });

// e) Remove worker name if AI reintroduces it
noteBody = noteBody.replace(workerNameRegex, "the support worker");

// f) Remove duplicated "the support worker the support worker"
noteBody = noteBody.replace(/the support worker the support worker/gi, "the support worker");
noteBody = noteBody.replace(/the support worker\s*,?\s*the support worker/gi, "the support worker");

// g) Remove emotional interpretation phrases
const interpretationReplacements = [
  { find: /improve his mood/gi, replace: "support his engagement" },
  { find: /improve her mood/gi, replace: "support her engagement" },
  { find: /improve their mood/gi, replace: "support their engagement" },

  { find: /positive impact on his behaviour/gi, replace: "he participated well" },
  { find: /positive impact on her behaviour/gi, replace: "she participated well" },
  { find: /positive impact on their behaviour/gi, replace: "they participated well" },

  { find: /relaxed environment/gi, replace: "predictable routine environment" },
  { find: /calm environment/gi, replace: "structured routine environment" },

  { find: /aimed to improve .* mood/gi, replace: "supported engagement in preferred activities" },

  { find: /promote emotional regulation/gi, replace: "support engagement in routine tasks" },
  { find: /emotional regulation/gi, replace: "engagement in routine tasks" }
];

interpretationReplacements.forEach(({ find, replace }) => {
  noteBody = noteBody.replace(find, replace);
});

// h) Remove template-like sentences
noteBody = noteBody.replace(/The activity provided was .*?location\./gi, "");



    // 7. Prepend standard header
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
