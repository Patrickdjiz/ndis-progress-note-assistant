// config/env.js
require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const DATABASE_URL = process.env.DATABASE_URL || null;

// PORT with a sane default
const PORT = Number(process.env.PORT) || 5000;

// Which DB implementation we’re using: "sqlite" (default) or "postgres"
const DB_DRIVER = process.env.DB_DRIVER || "sqlite";

// JWT secret for auth – NEVER commit the real value in production
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

if (!DATABASE_URL && DB_DRIVER === "postgres") {
  console.warn(
    "[env] DATABASE_URL is not set – Postgres features will not work until you configure it."
  );
}

module.exports = {
  NODE_ENV,
  FRONTEND_ORIGIN,
  DATABASE_URL,
  DB_DRIVER,
  JWT_SECRET,
  PORT,
};
