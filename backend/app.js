// app.js
const express = require("express");
const cors = require("cors");


const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const ownerRoutes = require("./routes/ownerRoutes");
const notesRoutes = require("./routes/notesRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "Backend running" });
});

// Auth routes (login, create user)
app.use("/api", authRoutes);

// new
app.use("/api/users", userRoutes);

app.use("/api/owner", ownerRoutes);

app.use("/api", notesRoutes);


module.exports = app;
