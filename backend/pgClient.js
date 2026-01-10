// pgClient.js
const { Pool } = require("pg");
const { DATABASE_URL, NODE_ENV } = require("./config/env");

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...(NODE_ENV === "production" ? { ssl: { rejectUnauthorized: false } } : {}),
});

// Helpful: log unexpected idle client errors (rare but useful)
pool.on("error", (err) => {
  console.error("Unexpected Postgres idle client error:", err);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function testConnection() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (e) {
    return false;
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, testConnection, closePool };
