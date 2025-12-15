// config/env.js
require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const DATABASE_URL = process.env.DATABASE_URL;
const DB_DRIVER = process.env.DB_DRIVER || "sqlite";

// AI / LLM config
const AI_BASE_URL = process.env.AI_BASE_URL || "http://localhost:11434";
const AI_MODEL = process.env.AI_MODEL || "llama3";

// PORT with a sane default
const PORT = Number(process.env.PORT) || 5000;

// JWT secret
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn(
    "[env] JWT_SECRET is not set – using a weak fallback secret for development only."
  );
  JWT_SECRET = "dev-insecure-jwt-secret-change-me";
}

if (!DATABASE_URL) {
  console.warn(
    "[env] DATABASE_URL is not set – Postgres features will not work until you configure it."
  );
}

module.exports = {
  NODE_ENV,
  FRONTEND_ORIGIN,
  DATABASE_URL,
  DB_DRIVER,
  AI_BASE_URL,
  AI_MODEL,
  JWT_SECRET,
  PORT,
};
