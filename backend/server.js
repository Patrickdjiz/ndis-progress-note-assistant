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
    const { rawInput } = req.body;

    if (!rawInput || !rawInput.trim()) {
      return res.status(400).json({ error: "rawInput is required" });
    }

    // Prompt we send to the model
    const prompt = `
You are an assistant helping NDIS support workers write professional, objective, and compliant progress notes.

Shift description (messy input from worker):
"${rawInput}"

TASK:
- Write a clear NDIS-style progress note.
- Be objective and neutral.
- Describe what actually happened during the shift.
- Use Australian spelling.
- Avoid judgemental language (no "difficult", "aggressive", etc.).
- Focus on activities and participant engagement.
Return ONLY the note text.
`;

    // Call Ollama's HTTP API
    const ollamaResponse = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "mistral",     // or "llama3", depending on what you pulled
        prompt: prompt,
        stream: false         // so we get one full response
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
