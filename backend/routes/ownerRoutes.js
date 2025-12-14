// routes/ownerRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole } = require("../authMiddleware");
const {
  createProviderSchema,
  booleanFlagSchema,
  orgStatusSchema,
} = require("../validation");

const router = express.Router();

// All routes here: must be logged in + OWNER
router.use(requireAuth);
router.use(requireRole("OWNER"));

/**
 * GET /api/owner/overview
 * Returns all organisations + their users (admins + workers)
 */
router.get("/overview", (req, res) => {
  try {
    const orgs = db
      .prepare(
        `
        SELECT id, name, status, createdAt
        FROM organisations
        ORDER BY createdAt DESC
      `
      )
      .all();

    const userStmt = db.prepare(
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

    res.json({ organisations: result });
  } catch (err) {
    console.error("Error in /api/owner/overview:", err.message);
    res.status(500).json({ error: "Failed to load overview" });
  }
});

/**
 * POST /api/owner/providers
 * body: { organisationName, adminEmail, adminFullName, adminPassword }
 * Creates an organisation + ADMIN user
 */
router.post("/providers", (req, res) => {
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

    // Check for existing user with same email (any org)
    const existingUser = db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .get(normalisedEmail);

    if (existingUser) {
      return res.status(400).json({
        error: "A user with this email already exists",
      });
    }

    // Optional: prevent duplicate provider name
    const existingOrg = db
      .prepare(`SELECT id FROM organisations WHERE name = ?`)
      .get(trimmedOrgName);

    if (existingOrg) {
      return res.status(400).json({
        error: "An organisation with this name already exists",
      });
    }

    const hash = bcrypt.hashSync(password, 10);

    // Use a transaction so org + admin are created together
    const createOrgAndAdmin = db.transaction(() => {
      // 1) Create org
      const orgStmt = db.prepare(`
        INSERT INTO organisations (name, status, createdAt)
        VALUES (?, 'ACTIVE', ?)
      `);
      const orgInfo = orgStmt.run(trimmedOrgName, nowIso);
      const orgId = orgInfo.lastInsertRowid;

      // 2) Create admin user
      const userStmt = db.prepare(`
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
router.patch("/organisations/:id/status", (req, res) => {
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

    const existing = db
      .prepare(`SELECT id FROM organisations WHERE id = ?`)
      .get(id);
    if (!existing) {
      return res.status(404).json({ error: "Organisation not found" });
    }

    db.prepare(`UPDATE organisations SET status = ? WHERE id = ?`).run(
      status,
      id
    );

    res.json({ ok: true, id, status });
  } catch (err) {
    console.error(
      "Error in PATCH /api/owner/organisations/:id/status:",
      err.message
    );
    res.status(500).json({ error: "Failed to update organisation status" });
  }
});

/**
 * PATCH /api/owner/users/:id/status
 * body: { isActive: boolean }
 * Owner can activate/deactivate ADMIN/WORKER but not OWNER accounts.
 */
router.patch("/users/:id/status", (req, res) => {
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
    const activeFlag = isActive ? 1 : 0;

    const existing = db
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

    // Don't let owner change OWNER accounts (including themselves)
    if (existing.role === "OWNER") {
      return res
        .status(400)
        .json({ error: "You cannot change status of OWNER accounts" });
    }

    db.prepare(`UPDATE users SET isActive = ? WHERE id = ?`).run(
      activeFlag,
      id
    );

    res.json({ ok: true, id, isActive: activeFlag });
  } catch (err) {
    console.error(
      "Error in PATCH /api/owner/users/:id/status:",
      err.message
    );
    res.status(500).json({ error: "Failed to update user status" });
  }
});

module.exports = router;
