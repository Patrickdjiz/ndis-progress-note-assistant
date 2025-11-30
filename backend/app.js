// app.js
const express = require("express");
const cors = require("cors");

const notesRoutes = require("./routes/notesRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "Backend running" });
});

// All note-related endpoints
app.use("/api", notesRoutes);

module.exports = app;
