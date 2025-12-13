// config/env.js
const dotenv = require("dotenv");

dotenv.config(); // loads .env if present

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 5000;

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

// JWT secret for signing tokens
const JWT_SECRET = process.env.JWT_SECRET;

// Optional: loud fail in non-test environments
if (!JWT_SECRET && NODE_ENV !== "test") {
  console.warn(
    "WARNING: JWT_SECRET is not set. Set it in your .env file for secure tokens."
  );
}

module.exports = {
  NODE_ENV,
  PORT,
  FRONTEND_ORIGIN,
  JWT_SECRET,
};
