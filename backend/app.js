// app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const crypto = require("crypto");

const { FRONTEND_ORIGIN, NODE_ENV } = require("./config/env");
const { testConnection } = require("./pgClient");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const ownerRoutes = require("./routes/ownerRoutes");
const notesRoutes = require("./routes/notesRoutes");
const accountRoutes = require("./routes/accountRoutes");
const passwordResetRoutes = require("./routes/passwordResetRoutes");

const app = express();

// Request ID (great for debugging)
app.use((req, res, next) => {
  const incoming = req.get("x-request-id");
  const safeIncoming =
    incoming && /^[a-zA-Z0-9\-]{1,80}$/.test(incoming) ? incoming : null;

  req.id =
    safeIncoming ||
    (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"));

  res.setHeader("X-Request-Id", req.id);
  next();
});




// ---- Rate limit store (Redis in prod, memory in dev) ----
let RedisStore, Redis, redis, makeStore;

if (process.env.REDIS_URL) {
  ({ RedisStore } = require("rate-limit-redis"));
  Redis = require("ioredis");
  redis = new Redis(process.env.REDIS_URL);

  makeStore = (prefix) =>
    new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    });
} else {
  makeStore = () => undefined; // dev fallback
}


app.set("trust proxy", 1);

app.disable("x-powered-by");

// Basic security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // or disable it
  })
);


// logs "/api/notes" instead of "/api/notes?participant=John"
morgan.token("safe-url", (req) => (req.originalUrl || "").split("?")[0]);
morgan.token("reqid", (req) => req.id || "-");

app.use(
  morgan(
    ':reqid :remote-addr :method :safe-url :status :res[content-length] - :response-time ms ":user-agent"'
  )
);



// CORS – only allow known frontend origin
const allowedOrigins = new Set([
  FRONTEND_ORIGIN,
  "https://www.ndisnotes.com",
  "https://ndisnotes.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const corsOptions = {
  origin(origin, callback) {
    // allow non-browser clients (no Origin header)
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Explicit preflight handling (important for some proxies/platforms)
app.options("*", cors(corsOptions));


// JSON body parsing
app.use(express.json({ limit: "1mb" }));

// Rate limits
// Rate limits (Redis-backed in prod if REDIS_URL is set)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:auth:ip:"),
  keyGenerator: (req) => req.ip,
  skip: (req) => req.method === "OPTIONS",
  message: { error: "Too many login attempts. Please try again later." },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:ai:ip:"),
  keyGenerator: (req) => req.ip,
  skip: (req) => req.method === "OPTIONS",
  message: { error: "Too many note generations. Please slow down." },
});

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:pwreset:ip:"),
  keyGenerator: (req) => req.ip,
  skip: (req) => req.method === "OPTIONS",
  message: { error: "Too many password reset requests. Please try again later." },
});

const accountPwLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:accountpw:ip:"),
  keyGenerator: (req) => req.ip,
  skip: (req) => req.method === "OPTIONS",
  message: { error: "Too many password change attempts. Please try again later." },
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


// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", requestId: req.id });
});

// Central error handler
app.use((err, req, res, next) => {
  const requestId = req?.id;

  if (err.message !== "Not allowed by CORS") {
    if (NODE_ENV !== "test") {
      console.error(`❌ [${requestId}] Internal error:`, err);
    }
  }

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      error: "CORS error: origin not allowed",
      requestId,
    });
  }

  const status = err.status || 500;

  const message =
    NODE_ENV === "production" && status === 500
      ? "Internal server error"
      : err.message || "Internal server error";

  res.status(status).json({ error: message, requestId });
});


module.exports = app;
