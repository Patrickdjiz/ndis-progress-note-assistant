const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");

const app = express();

app.use(cors());
app.use(express.json());

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "Backend running!" });
});

// AI Progress Note route
app.post("/api/generate-note", async (req, res) => {
  const { rawInput } = req.body;

  const prompt = `
You are an assistant helping NDIS support workers write objective, compliant NDIS progress notes.

Shift description:
"${rawInput}"

Write a detailed, professional progress note that follows:
- Objective language
- No assumptions
- No medical diagnoses
- Links activities to participant goals when appropriate
- Includes outcomes, support provided, and participant response
  `;

  // Call local Ollama model
  const ollama = spawn("ollama", ["run", "mistral"], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  let output = "";

  ollama.stdout.on("data", (data) => {
    output += data.toString();
  });

  ollama.on("close", () => {
    res.json({ note: output });
  });

  ollama.stdin.write(prompt);
  ollama.stdin.end();
});

// Start server
const PORT = 5000;
app.listen(PORT, () => console.log("Backend running on port", PORT));
