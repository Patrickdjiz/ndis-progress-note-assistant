// config/env.js
require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Fail fast in dev/prod if DB URL missing
  console.warn(
    "[env] DATABASE_URL is not set – Postgres features will not work until you configure it."
  );
}

module.exports = {
  NODE_ENV,
  FRONTEND_ORIGIN,
  DATABASE_URL,
};
