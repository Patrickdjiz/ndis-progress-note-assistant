// dbAdapter.js
// Thin wrapper so the rest of the app can talk to "a database"
// without caring if it's SQLite or Postgres.

const { DB_DRIVER } = require("./config/env");

// IMPORTANT: these require paths assume db.js and pgClient.js
// are in the backend root alongside this file.
const sqliteDb = require("./db");           // better-sqlite3 instance
const { query: pgQuery } = require("./pgClient");

/**
 * Run a SELECT that returns multiple rows.
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Array>}
 */
async function queryMany(sql, params = []) {
  if (DB_DRIVER === "postgres") {
    const res = await pgQuery(sql, params);
    return res.rows;
  }

  // SQLite (better-sqlite3) – synchronous, so we wrap in Promise.resolve
  const stmt = sqliteDb.prepare(sql);
  const rows = stmt.all(...params);
  return rows;
}

/**
 * Run a SELECT that should return at most one row.
 * Returns `null` if no row.
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Object|null>}
 */
async function queryOne(sql, params = []) {
  if (DB_DRIVER === "postgres") {
    const res = await pgQuery(sql, params);
    return res.rows[0] || null;
  }

  const stmt = sqliteDb.prepare(sql);
  const row = stmt.get(...params);
  return row || null;
}

/**
 * Run an INSERT / UPDATE / DELETE.
 * Returns a normalised result with rowCount and insertId (when available).
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<{ rowCount: number, insertId: number|null }>}
 */
async function execute(sql, params = []) {
  if (DB_DRIVER === "postgres") {
    const res = await pgQuery(sql, params);
    // insertId will only be non-null if the SQL uses `RETURNING id`
    const insertId = res.rows && res.rows[0] && res.rows[0].id
      ? Number(res.rows[0].id)
      : null;

    return {
      rowCount: res.rowCount || 0,
      insertId,
    };
  }

  const stmt = sqliteDb.prepare(sql);
  const info = stmt.run(...params);

  return {
    rowCount: info.changes || 0,
    insertId: info.lastInsertRowid ? Number(info.lastInsertRowid) : null,
  };
}

module.exports = {
  queryMany,
  queryOne,
  execute,
};
