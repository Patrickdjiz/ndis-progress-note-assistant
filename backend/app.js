// app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");

const { FRONTEND_ORIGIN, NODE_ENV } = require("./config/env");
const { testConnection } = require("./pgClient");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const ownerRoutes = require("./routes/ownerRoutes");
const notesRoutes = require("./routes/notesRoutes");
const accountRoutes = require("./routes/accountRoutes");
const passwordResetRoutes = require("./routes/passwordResetRoutes");

const app = express();

// If deployed behind a reverse proxy (Render/Railway/Fly/NGINX), this makes req.ip and rate-limit work correctly
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Basic security headers
app.use(helmet());

// Request logging: dev = verbose, prod = combined
if (NODE_ENV !== "production") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// CORS – only allow known frontend origin
const allowedOrigins = new Set([
  FRONTEND_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  })
);

// JSON body parsing
app.use(express.json({ limit: "1mb" }));

// Rate limits
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
});

app.use("/api/login", authLimiter);
app.use("/api/generate-note", aiLimiter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "Backend running" });
});

// DB health check (Postgres)
app.get("/api/health/db", async (req, res, next) => {
  try {
    const ok = await testConnection();
    if (!ok) {
      return res.status(500).json({ status: "db-error" });
    }
    res.json({ status: "ok" });
  } catch (err) {
    console.error("DB health error:", err);
    // Let the central error handler format the response
    next(err);
  }
});

// Routes
app.use("/api", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api", notesRoutes);
app.use("/api", accountRoutes);
app.use("/api/auth", passwordResetRoutes);


// -----------------------
// 404 handler
// -----------------------
app.use((req, res, next) => {
  res.status(404).json({ error: "Route not found" });
});

// -----------------------
// Central error handler
// -----------------------
app.use((err, req, res, next) => {
  // Avoid super noisy preflight logs
  if (err.message !== "Not allowed by CORS") {
    if (NODE_ENV !== "test") {
      console.error("❌ Internal error:", err);
    }
  }

  // Friendly CORS message
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS error: origin not allowed" });
  }

  const status = err.status || 500;

  // Hide internals in production
  const message =
    NODE_ENV === "production" && status === 500
      ? "Internal server error"
      : err.message || "Internal server error";

  res.status(status).json({ error: message });
});

module.exports = app;
