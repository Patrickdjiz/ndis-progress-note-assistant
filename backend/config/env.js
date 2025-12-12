// config/env.js
const dotenv = require("dotenv");

dotenv.config(); // loads .env if present

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 5000;

// Frontend origin – in prod you’ll set this in the host env
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

module.exports = {
  NODE_ENV,
  PORT,
  FRONTEND_ORIGIN,
};
