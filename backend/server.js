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

const timeToMinutes = (t) => {
  // Expects "HH:MM" 24h; returns minutes since midnight or null
  if (!t || typeof t !== "string") return null;
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};


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

    // 2. Basic time sanity check (same-day shift)
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);

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

    // 3. Simple "junk" detection for narrative fields
    const looksLikeJunk = (text) => {
      const t = text.trim();
      if (t.length < 10) return true; // too short to be useful
      if (!t.includes(" ") && t.length < 20) return true; // no spaces and short
      // same 1–3 chars repeated (e.g. "asd", "aaa", "123123")
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

    // 4. Prompt for Ollama – BODY ONLY (we add header ourselves)
    const prompt = `
You are assisting NDIS disability support workers to write professional, objective and compliant progress notes.

FIRST, carefully read the information below about this support shift.
SECOND, decide if there is enough clear, meaningful information to write a proper note.

If the information is vague, gibberish or clearly placeholder text (for example: "asd", "test", random characters, or extremely short notes that do not describe what happened), then:
- Do NOT create a normal progress note.
- Instead, return EXACTLY this format (and nothing else):
  ERROR: Insufficient information. Please rewrite the following fields with real details: [list the problematic fields in plain English].

Otherwise, if the information is clear enough, write a high-quality NDIS progress note BODY ONLY (no headers).

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

REQUIREMENTS FOR A VALID NOTE BODY:
- Use Australian English spelling (e.g. "behaviour", "organisation").
- Be FACTUAL and OBJECTIVE: describe what happened, what was observed and what the worker did.
- Use NEUTRAL, respectful, person-centred language. Avoid judgemental labels such as "difficult", "lazy", "non-compliant" or "aggressive".
- Focus on the participant’s actions, choices and responses where possible (person-centred).
- Include only information relevant to the participant's support and NDIS goals.
- Clearly link the activities to the participant's NDIS goals where possible (e.g. community access, daily living skills, communication, emotional regulation), not just "mental health" in general.
- If there were incidents, risks or changes, describe:
  • what happened,
  • where and when (if given),
  • the impact on the participant, and
  • what the worker did in response (checks, support, escalation).
- Do NOT state that an incident report was completed unless this is explicitly mentioned in the raw input.
- If follow-up is needed, give a clear and actionable handover (what should be monitored or done, and over what time frame).
- Do NOT add clinical diagnoses, labels or advice that were not mentioned.
- Do NOT invent details.

OUTPUT FORMAT FOR A VALID NOTE BODY:
Write 2–4 short paragraphs covering, in order:
1) Supports provided (what was done and where),
2) Participant’s presentation and engagement (including any changes from usual if implied),
3) Progress towards goals (how the activities related to their NDIS goals in concrete, functional terms),
4) Any incidents/risks/changes and follow-up or next steps.

IMPORTANT:
- Do NOT include any header lines such as "Support Worker:", "Date of Support:", etc.
- Do NOT restate the date, time or location in the first sentence (these are already captured in the header).
- Start directly with the first paragraph of the note body (e.g. "During this shift, ...").
- Return ONLY the note body text or the ERROR line.
`;

    const ollamaResponse = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "mistral", // or "llama3", etc.
        prompt,
        stream: false,
      }
    );

    const modelText = (ollamaResponse.data.response || "").trim();

    // 5. If the model followed the ERROR pattern, treat it as a 400
    if (modelText.startsWith("ERROR:")) {
      return res.status(400).json({ error: modelText });
    }

    // 6. Prepend standard header
    const header = [
      `Support Worker: ${workerName}`,
      `Date of Support: ${date}`,
      `Shift Time: ${shiftTime}`,
      `Location: ${safeLocation}`,
      `Participant: ${participantName}`,
    ].join("\n");

    const fullNote = `${header}\n\n${modelText}`;

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
