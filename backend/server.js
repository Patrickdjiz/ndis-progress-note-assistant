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
      location,
      activitiesAndSupports,
      participantPresentation,
      goalsWorkedOn,
      incidentsOrRisks,
      followUpActions,
      workerName,
    } = req.body;

    if (!participantName || !date || !activitiesAndSupports) {
      return res.status(400).json({
        error: "participantName, date and activitiesAndSupports are required",
      });
    }

    const safeLocation = location && location.trim() ? location : "not specified";

    const prompt = `
You are assisting NDIS disability support workers to write professional, objective and compliant progress notes.

Write ONE clear progress note using the information below.

Participant name: ${participantName}
Date of support: ${date}
Location: ${safeLocation}

Raw worker input – activities and supports:
${activitiesAndSupports || "Not specified."}

Raw worker input – participant presentation (mood/behaviour/health/communication):
${participantPresentation || "Not specified."}

Raw worker input – goals worked on:
${goalsWorkedOn || "Not specified."}

Raw worker input – incidents, risks, changes or concerns:
${incidentsOrRisks || "Not specified."}

Raw worker input – follow-up actions or next steps:
${followUpActions || "Not specified."}

Support worker name: ${workerName || "Support worker"}

REQUIREMENTS FOR THE NOTE:
- Be FACTUAL and OBJECTIVE: describe what happened, what was observed and what the worker did.
- Use NEUTRAL, respectful language. Do NOT use judgemental terms like "difficult", "lazy", "non-compliant" or "aggressive".
- Use Australian spelling.
- Only include information relevant to the participant's support and goals.
- Where possible, clearly link the activities to the participant's NDIS goals.
- If there were incidents, risks or changes, document them clearly and factually.
- If follow-up is needed, state this briefly at the end.
- Do NOT add any clinical diagnoses, opinions or advice that were not mentioned.
- Do NOT invent details.

STRUCTURE:
Write the note as 2–5 concise paragraphs, covering in order:
1) Participant info and supports provided (what you did and where),
2) Participant’s presentation (how they engaged, mood/behaviour/health),
3) Progress towards goals (how the activities related to goals),
4) Any incidents/risks/changes and follow-up or next steps.

Return ONLY the final note text. Do not include headings, bullet points, labels or the raw input again.
`;

    const ollamaResponse = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "mistral", // or "llama3" etc.
        prompt,
        stream: false,
      }
    );

    const noteText = ollamaResponse.data.response;
    return res.json({ note: noteText });
  } catch (error) {
    console.error("Error generating note:", error.message);
    return res.status(500).json({ error: "Failed to generate note" });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
