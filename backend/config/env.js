// config/env.js
require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const PORT = Number(process.env.PORT) || 5000;

// DB (Postgres only)
const DATABASE_URL = process.env.DATABASE_URL;
const DB_DRIVER = process.env.DB_DRIVER || "postgres";

if (NODE_ENV !== "test") {
  if (DB_DRIVER !== "postgres") {
    console.warn(`[env] DB_DRIVER is '${DB_DRIVER}'. This app is Postgres-only now.`);
  }
}

if (!DATABASE_URL) {
  // In production you want to FAIL FAST
  if (NODE_ENV === "production") {
    throw new Error("[env] DATABASE_URL is required in production");
  }
  console.warn("[env] DATABASE_URL is not set (dev/test only).");
}

// AI / LLM config
const AI_BASE_URL = process.env.AI_BASE_URL || "http://localhost:11434";
const AI_MODEL = process.env.AI_MODEL || "llama3";

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (NODE_ENV === "production") {
    throw new Error("[env] JWT_SECRET is required in production");
  }
  console.warn("[env] JWT_SECRET missing – using dev fallback (NOT for production).");
}

module.exports = {
  NODE_ENV,
  FRONTEND_ORIGIN,
  PORT,

  DATABASE_URL,
  DB_DRIVER,

  AI_BASE_URL,
  AI_MODEL,

  JWT_SECRET: JWT_SECRET || "dev-insecure-jwt-secret-change-me",
};
