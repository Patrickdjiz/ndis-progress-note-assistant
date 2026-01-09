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

app.disable("x-powered-by");

// If deployed behind a reverse proxy (Render/Railway/Fly/NGINX), this makes req.ip and rate-limit work correctly
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Basic security headers
app.use(helmet());

const morgan = require("morgan");

// logs "/api/notes" instead of "/api/notes?participant=John"
morgan.token("safe-url", (req) => (req.originalUrl || "").split("?")[0]);

app.use(
  morgan(
    ':remote-addr :method :safe-url :status :res[content-length] - :response-time ms ":user-agent"'
  )
);


// CORS – only allow known frontend origin
const allowedOrigins = new Set([
  FRONTEND_ORIGIN,
  "https://www.ndisnotes.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://ndisnotes.com",
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

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
});

const accountPwLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
});


app.use("/api/login", authLimiter);
app.use("/api/generate-note", aiLimiter);
app.use("/api/auth", passwordLimiter); // forgot-password + reset-password
app.use("/api/account/change-password", accountPwLimiter);


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

// Never cache API responses (sensitive data)
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});


// Routes
app.use("/api/auth", passwordResetRoutes);
app.use("/api", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api", notesRoutes);
app.use("/api", accountRoutes);


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
