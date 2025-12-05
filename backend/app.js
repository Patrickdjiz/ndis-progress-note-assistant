// app.js
const express = require("express");
const cors = require("cors");

const notesRoutes = require("./routes/notesRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "Backend running" });
});

// Auth routes (login, create user)
app.use("/api", authRoutes);

// Notes routes (all protected inside notesRoutes via router.use(requireAuth))
app.use("/api", notesRoutes);

module.exports = app;
