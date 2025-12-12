// app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");

const { FRONTEND_ORIGIN, NODE_ENV } = require("./config/env");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const ownerRoutes = require("./routes/ownerRoutes");
const notesRoutes = require("./routes/notesRoutes");

const app = express();

// Basic security headers
app.use(helmet());

// Simple request logging (more verbose in dev)
if (NODE_ENV !== "production") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// CORS – restrict to allowed frontend origins
const allowedOrigins = new Set([
  FRONTEND_ORIGIN,
  // Extra local dev helpers (optional)
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use(
  cors({
    origin(origin, callback) {
      // allow non-browser tools (Postman, curl) which send no origin
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  })
);

// Body parsing with a sane limit
app.use(express.json({ limit: "1mb" }));


// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,            // tweak as you like
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limits to specific routes
app.use("/api/login", authLimiter);
app.use("/api/generate-note", aiLimiter);

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

// Central error handler (must come after all routes & middleware)
app.use((err, req, res, next) => {
  // Basic logging
  console.error(err);

  // Friendly CORS error message
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS error: origin not allowed" });
  }

  const status = err.status || 500;
  const message =
    status === 500 && NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

  res.status(status).json({ error: message });
});

module.exports = app;