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

You will receive structured information about ONE support shift. Your job is to write the BODY of the progress note ONLY (no headers), in clear Australian English.

If the information is vague, gibberish or clearly placeholder text (for example: "asd", "test", random characters, or extremely short notes that do not describe what happened), then:
- Do NOT create a normal progress note.
- Instead, return EXACTLY this format (and nothing else):
  ERROR: Insufficient information. Please rewrite the following fields with real details: [list the problematic fields in plain English].

Otherwise, if the information is clear enough, write a high-quality NDIS progress note BODY ONLY.

Participant name: ${participantName}
Date of support: ${date}
Shift time: ${shiftTime}
Location: ${safeLocation}

Raw worker input – activities and supports:
${activitiesAndSupports}

Raw worker input – participant presentation (mood/behaviour/health/communication):
${participantPresentation}

Raw worker input – goals worked on:
${goalsWorkedOn}

Raw worker input – incidents, risks, changes or concerns:
${incidentsOrRisks}

Raw worker input – follow-up actions or next steps:
${followUpActions}

Support worker name: ${workerName}

STYLE AND SAFETY RULES:
- Use Australian English spelling (e.g. "behaviour", "organisation").
- Write STRICTLY in THIRD-PERSON. Do NOT use "I", "we", "my", "our" or similar. Refer to "the support worker" and the participant by name.
- Be FACTUAL and OBJECTIVE: describe what happened, what was observed and what the support worker did.
- Use NEUTRAL, respectful, person-centred language. Avoid judgemental labels such as "difficult", "lazy", "non-compliant" or "aggressive".
- Focus on the participant’s actions, choices and responses where possible.
- Include only information relevant to the participant's support and NDIS goals.
- ONLY describe mood, behaviour, stress, mental health or emotional state if this is clearly implied or stated in the raw worker input. Do NOT invent new symptoms or problems.
- Clearly link the activities to the participant's NDIS goals where possible (e.g. community access, daily living skills, communication, emotional regulation), not just "mental health" in general.
- If there were incidents, risks or changes, describe:
  • what happened,
  • where and when (if given),
  • the impact on the participant, and
  • what the support worker did in response (checks, support, escalation).
- Do NOT state that an incident report was completed unless this is explicitly mentioned in the raw input.
- ALWAYS include a brief follow-up / handover paragraph at the end, even if it is simple (e.g. what to monitor next shift).
- Do NOT add clinical diagnoses, labels or advice that were not mentioned.
- Do NOT invent details.

OUTPUT FORMAT FOR A VALID NOTE BODY:
- Do NOT introduce the note. Do NOT write phrases like "Here is the body of the note", "Here is the written progress note", "Below is" or similar.
- Do NOT include any header lines such as "Support Worker:", "Date of Support:", etc.
- Do NOT restate the date, time or location in the first sentence (these are already captured in the header).
- Start directly with the first paragraph of the note body, e.g. "During this shift, the support worker..." or "Throughout this shift, the support worker...".
- Write 2–4 short paragraphs covering, in order:
  1) Supports provided (what was done and where),
  2) Participant’s presentation and engagement (including any changes from usual if implied),
  3) Progress towards goals (how the activities related to their NDIS goals in concrete, functional terms),
  4) A final paragraph with any incidents/risks/changes AND clear follow-up or next steps (handover).
- Return ONLY the note body text or the ERROR line.
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
