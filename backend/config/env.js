// config/env.js
require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const DATABASE_URL = process.env.DATABASE_URL || null;

// Normalise DB_DRIVER and validate
let DB_DRIVER = (process.env.DB_DRIVER || "sqlite").toLowerCase();

if (!["sqlite", "postgres"].includes(DB_DRIVER)) {
  console.warn(
    `[env] Unknown DB_DRIVER "${DB_DRIVER}", defaulting to "sqlite". ` +
      'Set DB_DRIVER to either "sqlite" or "postgres" in your .env.'
  );
  DB_DRIVER = "sqlite";
}

if (DB_DRIVER === "postgres" && !DATABASE_URL) {
  console.warn(
    "[env] DB_DRIVER=postgres but DATABASE_URL is missing – Postgres will not work until you configure it."
  );
}

module.exports = {
  NODE_ENV,
  FRONTEND_ORIGIN,
  DATABASE_URL,
  DB_DRIVER,
};
