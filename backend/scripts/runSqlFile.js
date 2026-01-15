// scripts/runSqlFile.js
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/runSqlFile.js <path/to/file.sql>");
    process.exit(1);
  }

  const sql = fs.readFileSync(path.resolve(file), "utf8");

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("Missing DATABASE_URL env var");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    // Fly Postgres typically requires TLS; if your DATABASE_URL already includes sslmode, this is still fine.
    ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`✅ Ran migration: ${file}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
