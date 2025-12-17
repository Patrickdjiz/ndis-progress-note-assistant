// config/env.js
require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

// Frontend origin (CORS allowlist)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

// Database
const DB_DRIVER = (process.env.DB_DRIVER || "sqlite").toLowerCase();

// For sqlite, DATABASE_URL should be a file path (or :memory:)
const DATABASE_URL =
  process.env.DATABASE_URL || (DB_DRIVER === "sqlite" ? "./data/app.sqlite" : "");

// AI / LLM config
const AI_BASE_URL = process.env.AI_BASE_URL || "http://localhost:11434";
const AI_MODEL = process.env.AI_MODEL || "llama3";

// Server
const PORT = Number(process.env.PORT) || 5000;

// Auth
const JWT_SECRET = process.env.JWT_SECRET || "";
if (!JWT_SECRET && NODE_ENV === "production") {
  throw new Error("JWT_SECRET is required in production");
}

module.exports = {
  NODE_ENV,
  FRONTEND_ORIGIN,
  DB_DRIVER,
  DATABASE_URL,
  AI_BASE_URL,
  AI_MODEL,
  PORT,
  JWT_SECRET,
};
