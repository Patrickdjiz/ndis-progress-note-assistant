// pgClient.js
const { Pool } = require("pg");
const { DATABASE_URL, NODE_ENV } = require("./config/env");

if (!DATABASE_URL) {
  console.error(
    "[pgClient] DATABASE_URL is missing. Set it in your .env before starting the server."
  );
  // In dev you *could* throw; for now just log loudly.
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // In production (e.g. Render / Railway) you often need SSL:
  ...(NODE_ENV === "production"
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

pool.on("error", (err) => {
  console.error("[pgClient] Unexpected error on idle client", err);
});

async function testConnection() {
  const res = await pool.query("SELECT 1 AS ok");
  return res.rows[0].ok === 1;
}

// Small helper wrapper so later we can do: db.query(text, params)
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query,
  testConnection,
};
