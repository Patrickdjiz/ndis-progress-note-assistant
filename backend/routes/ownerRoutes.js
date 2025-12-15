// routes/ownerRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { requireAuth, requireRole } = require("../authMiddleware");
const {
  createProviderSchema,
  booleanFlagSchema,
  orgStatusSchema,
} = require("../validation");
const { query, findUserByEmail } = require("../dbAdapter");

const router = express.Router();

// All routes here: must be logged in + OWNER
router.use(requireAuth);
router.use(requireRole("OWNER"));

/**
 * GET /api/owner/overview
 * Returns all organisations + their users (admins + workers)
 *
 * Shape matches the old SQLite version:
 * [
 *   {
 *     id, name, status, createdAt,
 *     users: [{ id, email, fullName, role, isActive, createdAt }, ...]
 *   },
 *   ...
 * ]
 */
router.get("/overview", async (req, res) => {
  try {
    // 1) Load all orgs
    const orgResult = await query(
      `
        SELECT
          id,
          name,
          status,
          created_at AS "createdAt"
        FROM organisations
        ORDER BY created_at DESC
      `
    );
    const orgs = orgResult.rows;

    if (orgs.length === 0) {
      return res.json({ organisations: [] });
    }

    // 2) Load all users, grouped by organisation
    const userResult = await query(
      `
        SELECT
          id,
          email,
          full_name AS "fullName",
          role,
          is_active AS "isActive",
          created_at AS "createdAt",
          organisation_id AS "organisationId"
        FROM users
        ORDER BY organisation_id, role DESC, created_at DESC
      `
    );
    const users = userResult.rows;

    // 3) Attach users to orgs
    const orgMap = new Map(
      orgs.map((org) => [org.id, { ...org, users: [] }])
    );

    for (const u of users) {
      const org = orgMap.get(u.organisationId);
      if (org) {
        org.users.push({
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt,
        });
      }
    }

    const result = Array.from(orgMap.values());
    return res.json({ organisations: result });
  } catch (err) {
    console.error("Error in /api/owner/overview:", err.message);
    return res.status(500).json({ error: "Failed to load overview" });
  }
});

/**
 * POST /api/owner/providers
 * body: { organisationName, adminEmail, adminFullName, adminPassword }
 * Creates an organisation + ADMIN user (in one atomic CTE)
 */
router.post("/providers", async (req, res) => {
  try {
    // ✅ Validate body with Zod
    const parsed = createProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid provider data" });
    }

    const {
      organisationName,
      adminEmail,
      adminFullName,
      adminPassword,
    } = parsed.data;

    const trimmedOrgName = organisationName.trim();
    const normalisedEmail = adminEmail.trim().toLowerCase();
    const trimmedFullName = adminFullName.trim();
    const password = adminPassword.trim();

    // 1) Check for existing user with same email (any org)
    const existingUser = await findUserByEmail(normalisedEmail);
    if (existingUser) {
      return res.status(400).json({
        error: "A user with this email already exists",
      });
    }

    // 2) Optional: prevent duplicate provider name
    const orgCheck = await query(
      `SELECT id FROM organisations WHERE lower(name) = lower($1)`,
      [trimmedOrgName]
    );
    if (orgCheck.rows[0]) {
      return res.status(400).json({
        error: "An organisation with this name already exists",
      });
    }

    const hash = bcrypt.hashSync(password, 10);

    // 3) Atomically create org + admin using a CTE
    const cteSql = `
      WITH new_org AS (
        INSERT INTO organisations (name, status)
        VALUES ($1, 'ACTIVE')
        RETURNING
          id,
          name,
          status,
          created_at
      ),
      new_admin AS (
        INSERT INTO users (
          organisation_id,
          email,
          password_hash,
          role,
          full_name,
          is_active
        )
        SELECT
          id,
          $2,
          $3,
          'ADMIN',
          $4,
          TRUE
        FROM new_org
        RETURNING
          id,
          organisation_id,
          email,
          full_name,
          role,
          is_active,
          created_at
      )
      SELECT
        new_org.id                AS "orgId",
        new_org.name              AS "orgName",
        new_org.status            AS "orgStatus",
        new_org.created_at        AS "orgCreatedAt",
        new_admin.id              AS "adminId",
        new_admin.organisation_id AS "adminOrgId",
        new_admin.email           AS "adminEmail",
        new_admin.full_name       AS "adminFullName",
        new_admin.role            AS "adminRole",
        new_admin.is_active       AS "adminIsActive",
        new_admin.created_at      AS "adminCreatedAt"
      FROM new_org, new_admin;
    `;

    const { rows } = await query(cteSql, [
      trimmedOrgName,
      normalisedEmail,
      hash,
      trimmedFullName,
    ]);

    const row = rows[0];

    const organisation = {
      id: row.orgId,
      name: row.orgName,
      status: row.orgStatus,
      createdAt: row.orgCreatedAt,
    };

    const admin = {
      id: row.adminId,
      organisationId: row.adminOrgId,
      email: row.adminEmail,
      fullName: row.adminFullName,
      role: row.adminRole,
      isActive: row.adminIsActive,
      createdAt: row.adminCreatedAt,
    };

    return res.status(201).json({ organisation, admin });
  } catch (err) {
    console.error("Error creating provider:", err);
    return res.status(500).json({ error: "Failed to create provider" });
  }
});

/**
 * PATCH /api/owner/organisations/:id/status
 * body: { status: 'ACTIVE' | 'SUSPENDED' }
 */
router.patch("/organisations/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid organisation id" });
    }

    // ✅ Validate body
    const parsed = orgStatusSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid status data" });
    }
    const { status } = parsed.data;

    const existing = await query(
      `SELECT id FROM organisations WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Organisation not found" });
    }

    await query(`UPDATE organisations SET status = $1 WHERE id = $2`, [
      status,
      id,
    ]);

    return res.json({ ok: true, id, status });
  } catch (err) {
    console.error(
      "Error in PATCH /api/owner/organisations/:id/status:",
      err.message
    );
    return res.status(500).json({ error: "Failed to update organisation status" });
  }
});

/**
 * PATCH /api/owner/users/:id/status
 * body: { isActive: boolean }
 * Owner can activate/deactivate ADMIN/WORKER but not OWNER accounts.
 */
router.patch("/users/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    // ✅ Validate body
    const parsed = booleanFlagSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid status data" });
    }
    const { isActive } = parsed.data;

    const existingRes = await query(
      `
        SELECT
          id,
          role
        FROM users
        WHERE id = $1
      `,
      [id]
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    // Don't let owner change OWNER accounts (including themselves)
    if (existing.role === "OWNER") {
      return res
        .status(400)
        .json({ error: "You cannot change status of OWNER accounts" });
    }

    await query(`UPDATE users SET is_active = $1 WHERE id = $2`, [
      isActive,
      id,
    ]);

    return res.json({ ok: true, id, isActive: isActive ? 1 : 0 });
  } catch (err) {
    console.error(
      "Error in PATCH /api/owner/users/:id/status:",
      err.message
    );
    return res.status(500).json({ error: "Failed to update user status" });
  }
});

module.exports = router;
