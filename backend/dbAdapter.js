// dbAdapter.js
const { query: pgQuery } = require("./pgClient");

// Generic wrapper around pgClient so the rest of the code
// doesn't have to import pg directly.
async function query(sql, params = []) {
  const res = await pgQuery(sql, params);
  return {
    rows: res.rows,
    rowCount: res.rowCount,
  };
}

/**
 * Auth helper: find user + org status by email.
 * Used in login flow.
 */
async function findUserByEmailWithOrg(email) {
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

/**
 * Simple helper: find user by email (no org join).
 * Used for uniqueness check when creating workers.
 */
async function findUserByEmail(email) {
  const { rows } = await query(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [email]
  );
  return rows[0] || null;
}

/**
 * List team for the current organisation.
 * Matches the old logic:
 *  - same org
 *  - role = WORKER OR id = current admin
 */
async function getOrgUsersForAdmin(orgId, adminId) {
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

/**
 * Create a WORKER user in the given organisation.
 * Returns a normalised user object.
 */
async function createWorkerUser({ orgId, email, fullName, passwordHash }) {
  const nowIso = new Date().toISOString();

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

/**
 * Find a user by id + organisation (used before toggling status).
 */
async function findUserByIdInOrg(userId, orgId) {
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

/**
 * Update a user's isActive flag by id.
 */
async function updateUserActiveFlag(userId, isActive) {
  const sql = `UPDATE users SET is_active = $1 WHERE id = $2`;
  await query(sql, [isActive, userId]);
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
