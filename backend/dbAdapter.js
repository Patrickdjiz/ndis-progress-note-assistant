// dbAdapter.js
const { DB_DRIVER } = require("./config/env");
const sqliteDb = require("./db");
const { query: pgQuery } = require("./pgClient");

const isPostgres = DB_DRIVER === "postgres";

// Detect if a statement is a SELECT
function isSelect(sql) {
  return /^\s*select/i.test(sql);
}

/**
 * Generic query helper.
 *  - For Postgres: wraps pg.query and returns { rows, rowCount }.
 *  - For SQLite: runs the statement and returns a similar shape.
 */
async function query(sql, params = []) {
  if (isPostgres) {
    const res = await pgQuery(sql, params);
    return {
      rows: res.rows,
      rowCount: res.rowCount,
    };
  }

  const stmt = sqliteDb.prepare(sql);
  if (isSelect(sql)) {
    const rows = stmt.all(...params);
    return { rows, rowCount: rows.length };
  } else {
    const info = stmt.run(...params);
    return {
      rows: [],
      rowCount: info.changes ?? 0,
      lastInsertId: info.lastInsertRowid ?? null,
    };
  }
}

/**
 * Auth helper: find user + org status by email.
 * Used in login flow.
 */
async function findUserByEmailWithOrg(email) {
  if (isPostgres) {
    const sql = `
      SELECT
        u.id,
        u.email,
        u.password_hash AS "passwordHash",
        u.role,
        u.full_name AS "fullName",
        u.is_active AS "isActive",
        u.organisation_id AS "organisationId",
        o.status AS "orgStatus"
      FROM users u
      JOIN organisations o ON u.organisation_id = o.id
      WHERE lower(u.email) = lower($1)
    `;
    const { rows } = await query(sql, [email]);
    return rows[0] || null;
  }

  const stmt = sqliteDb.prepare(`
    SELECT
      u.id,
      u.email,
      u.passwordHash,
      u.role,
      u.fullName,
      u.isActive,
      u.organisationId,
      o.status AS orgStatus
    FROM users u
    JOIN organisations o ON u.organisationId = o.id
    WHERE u.email = ?
  `);
  return stmt.get(email) || null;
}

/**
 * Simple helper: find user by email (no org join).
 * Used for uniqueness check when creating workers.
 */
async function findUserByEmail(email) {
  if (isPostgres) {
    const { rows } = await query(
      `SELECT id FROM users WHERE lower(email) = lower($1)`,
      [email]
    );
    return rows[0] || null;
  }

  const stmt = sqliteDb.prepare(`SELECT id FROM users WHERE email = ?`);
  return stmt.get(email) || null;
}

/**
 * List team for the current organisation.
 * Matches the old SQLite query:
 *  - same org
 *  - role = WORKER OR id = current admin
 */
async function getOrgUsersForAdmin(orgId, adminId) {
  if (isPostgres) {
    const sql = `
      SELECT
        id,
        email,
        full_name AS "fullName",
        role,
        is_active AS "isActive",
        created_at AS "createdAt"
      FROM users
      WHERE organisation_id = $1
        AND (role = 'WORKER' OR id = $2)
      ORDER BY role DESC, created_at DESC
    `;
    const { rows } = await query(sql, [orgId, adminId]);
    return rows;
  }

  const stmt = sqliteDb.prepare(`
    SELECT id, email, fullName, role, isActive, createdAt
    FROM users
    WHERE organisationId = ?
      AND (role = 'WORKER' OR id = ?)
    ORDER BY role DESC, createdAt DESC
  `);
  return stmt.all(orgId, adminId);
}

/**
 * Create a WORKER user in the given organisation.
 * Returns a normalised user object (id, email, fullName, role, isActive, createdAt).
 */
async function createWorkerUser({ orgId, email, fullName, passwordHash }) {
  const nowIso = new Date().toISOString();

  if (isPostgres) {
    const sql = `
      INSERT INTO users (
        organisation_id,
        email,
        password_hash,
        role,
        full_name,
        is_active,
        created_at
      )
      VALUES ($1, $2, $3, 'WORKER', $4, TRUE, $5)
      RETURNING
        id,
        email,
        full_name AS "fullName",
        role,
        is_active AS "isActive",
        created_at AS "createdAt"
    `;
    const { rows } = await query(sql, [
      orgId,
      email,
      passwordHash,
      fullName,
      nowIso,
    ]);
    return rows[0];
  }

  const stmt = sqliteDb.prepare(`
    INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
    VALUES (?, ?, ?, 'WORKER', ?, 1, ?)
  `);
  const info = stmt.run(orgId, email, passwordHash, fullName, nowIso);

  return {
    id: info.lastInsertRowid,
    email,
    fullName,
    role: "WORKER",
    isActive: 1,
    createdAt: nowIso,
  };
}

/**
 * Find a user by id + organisation (used before toggling status).
 */
async function findUserByIdInOrg(userId, orgId) {
  if (isPostgres) {
    const sql = `
      SELECT
        id,
        role
      FROM users
      WHERE id = $1
        AND organisation_id = $2
    `;
    const { rows } = await query(sql, [userId, orgId]);
    return rows[0] || null;
  }

  const stmt = sqliteDb.prepare(
    `SELECT id, role FROM users WHERE id = ? AND organisationId = ?`
  );
  return stmt.get(userId, orgId) || null;
}

/**
 * Update a user's isActive flag by id.
 */
async function updateUserActiveFlag(userId, isActive) {
  if (isPostgres) {
    await query(`UPDATE users SET is_active = $1 WHERE id = $2`, [
      isActive,
      userId,
    ]);
    return;
  }

  const activeFlag = isActive ? 1 : 0;
  sqliteDb
    .prepare(`UPDATE users SET isActive = ? WHERE id = ?`)
    .run(activeFlag, userId);
}

module.exports = {
  // generic
  query,

  // auth helper
  findUserByEmailWithOrg,

  // user helpers
  findUserByEmail,
  getOrgUsersForAdmin,
  createWorkerUser,
  findUserByIdInOrg,
  updateUserActiveFlag,
};
