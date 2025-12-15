// routes/ownerRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const sqliteDb = require("../db"); // used only when not on Postgres
const { requireAuth, requireRole } = require("../authMiddleware");
const {
  createProviderSchema,
  booleanFlagSchema,
  orgStatusSchema,
} = require("../validation");
const { query, isPostgres } = require("../dbAdapter");

const router = express.Router();

// All routes here: must be logged in + OWNER
router.use(requireAuth);
router.use(requireRole("OWNER"));

/**
 * GET /api/owner/overview
 * Returns all organisations + their users (admins + workers)
 */
router.get("/overview", async (req, res) => {
  try {
    if (isPostgres) {
      // ----- Postgres path -----
      const orgSql = `
        SELECT
          id,
          name,
          status,
          created_at AS "createdAt"
        FROM organisations
        ORDER BY created_at DESC
      `;
      const { rows: orgs } = await query(orgSql);

      const userSql = `
        SELECT
          id,
          email,
          full_name     AS "fullName",
          role,
          is_active     AS "isActive",
          created_at    AS "createdAt",
          organisation_id AS "organisationId"
        FROM users
        ORDER BY organisation_id, role DESC, created_at DESC
      `;
      const { rows: users } = await query(userSql);

      const result = orgs.map((org) => {
        const orgUsers = users
          .filter((u) => u.organisationId === org.id)
          .map(({ organisationId, ...rest }) => rest);

        return {
          ...org,
          users: orgUsers,
        };
      });

      return res.json({ organisations: result });
    }

    // ----- SQLite fallback -----
    const orgs = sqliteDb
      .prepare(
        `
        SELECT id, name, status, createdAt
        FROM organisations
        ORDER BY createdAt DESC
      `
      )
      .all();

    const userStmt = sqliteDb.prepare(
      `
        SELECT id, email, fullName, role, isActive, createdAt
        FROM users
        WHERE organisationId = ?
        ORDER BY role DESC, createdAt DESC
      `
    );

    const result = orgs.map((org) => {
      const users = userStmt.all(org.id);
      return {
        ...org,
        users,
      };
    });

    return res.json({ organisations: result });
  } catch (err) {
    console.error("Error in /api/owner/overview:", err.message);
    return res.status(500).json({ error: "Failed to load overview" });
  }
});

/**
 * POST /api/owner/providers
 * body: { organisationName, adminEmail, adminFullName, adminPassword }
 * Creates an organisation + ADMIN user
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
    const nowIso = new Date().toISOString();

    const hash = bcrypt.hashSync(password, 10);

    if (isPostgres) {
      // ----- Postgres path -----

      // Check existing user by email
      const { rows: existingUserRows } = await query(
        `SELECT id FROM users WHERE lower(email) = lower($1)`,
        [normalisedEmail]
      );
      if (existingUserRows[0]) {
        return res.status(400).json({
          error: "A user with this email already exists",
        });
      }

      // Optional: prevent duplicate provider name
      const { rows: existingOrgRows } = await query(
        `SELECT id FROM organisations WHERE name = $1`,
        [trimmedOrgName]
      );
      if (existingOrgRows[0]) {
        return res.status(400).json({
          error: "An organisation with this name already exists",
        });
      }

      // Use a CTE to create org + admin atomically
      const sql = `
        WITH new_org AS (
          INSERT INTO organisations (name, status, created_at)
          VALUES ($1, 'ACTIVE', $2)
          RETURNING id, name, status, created_at
        ),
        new_admin AS (
          INSERT INTO users (
            organisation_id,
            email,
            password_hash,
            role,
            full_name,
            is_active,
            created_at
          )
          SELECT
            id,
            $3,
            $4,
            'ADMIN',
            $5,
            TRUE,
            $2
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
          row_to_json(new_org)   AS organisation,
          row_to_json(new_admin) AS admin
        FROM new_org, new_admin
      `;

      const { rows } = await query(sql, [
        trimmedOrgName,
        nowIso,
        normalisedEmail,
        hash,
        trimmedFullName,
      ]);

      const row = rows[0];
      const organisation = row.organisation;
      const admin = row.admin;

      return res.status(201).json({ organisation, admin });
    }

    // ----- SQLite fallback -----

    // Check for existing user with same email (any org)
    const existingUser = sqliteDb
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .get(normalisedEmail);

    if (existingUser) {
      return res.status(400).json({
        error: "A user with this email already exists",
      });
    }

    // Optional: prevent duplicate provider name
    const existingOrg = sqliteDb
      .prepare(`SELECT id FROM organisations WHERE name = ?`)
      .get(trimmedOrgName);

    if (existingOrg) {
      return res.status(400).json({
        error: "An organisation with this name already exists",
      });
    }

    // Transaction so org + admin are created together
    const createOrgAndAdmin = sqliteDb.transaction(() => {
      const orgStmt = sqliteDb.prepare(`
        INSERT INTO organisations (name, status, createdAt)
        VALUES (?, 'ACTIVE', ?)
      `);
      const orgInfo = orgStmt.run(trimmedOrgName, nowIso);
      const orgId = orgInfo.lastInsertRowid;

      const userStmt = sqliteDb.prepare(`
        INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
        VALUES (?, ?, ?, 'ADMIN', ?, 1, ?)
      `);
      const adminInfo = userStmt.run(
        orgId,
        normalisedEmail,
        hash,
        trimmedFullName,
        nowIso
      );

      return { orgId, adminId: adminInfo.lastInsertRowid };
    });

    const { orgId, adminId } = createOrgAndAdmin();

    const organisation = {
      id: orgId,
      name: trimmedOrgName,
      status: "ACTIVE",
      createdAt: nowIso,
    };

    const admin = {
      id: adminId,
      organisationId: orgId,
      email: normalisedEmail,
      fullName: trimmedFullName,
      role: "ADMIN",
      isActive: 1,
      createdAt: nowIso,
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

    if (isPostgres) {
      const { rows } = await query(
        `SELECT id FROM organisations WHERE id = $1`,
        [id]
      );
      if (!rows[0]) {
        return res.status(404).json({ error: "Organisation not found" });
      }

      await query(
        `UPDATE organisations SET status = $1 WHERE id = $2`,
        [status, id]
      );

      return res.json({ ok: true, id, status });
    }

    // SQLite fallback
    const existing = sqliteDb
      .prepare(`SELECT id FROM organisations WHERE id = ?`)
      .get(id);
    if (!existing) {
      return res.status(404).json({ error: "Organisation not found" });
    }

    sqliteDb
      .prepare(`UPDATE organisations SET status = ? WHERE id = ?`)
      .run(status, id);

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
    const activeFlag = !!isActive;

    if (isPostgres) {
      // Fetch user + role
      const { rows } = await query(
        `
          SELECT id, role
          FROM users
          WHERE id = $1
        `,
        [id]
      );

      const existing = rows[0];
      if (!existing) {
        return res.status(404).json({ error: "User not found" });
      }

      if (existing.role === "OWNER") {
        return res
          .status(400)
          .json({ error: "You cannot change status of OWNER accounts" });
      }

      await query(
        `UPDATE users SET is_active = $1 WHERE id = $2`,
        [activeFlag, id]
      );

      return res.json({ ok: true, id, isActive: activeFlag ? 1 : 0 });
    }

    // SQLite fallback
    const existing = sqliteDb
      .prepare(
        `
        SELECT id, role
        FROM users
        WHERE id = ?
      `
      )
      .get(id);

    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    if (existing.role === "OWNER") {
      return res
        .status(400)
        .json({ error: "You cannot change status of OWNER accounts" });
    }

    sqliteDb
      .prepare(`UPDATE users SET isActive = ? WHERE id = ?`)
      .run(activeFlag ? 1 : 0, id);

    return res.json({ ok: true, id, isActive: activeFlag ? 1 : 0 });
  } catch (err) {
    console.error(
      "Error in PATCH /api/owner/users/:id/status:",
      err.message
    );
    return res.status(500).json({ error: "Failed to update user status" });
  }
});

module.exports = router;
