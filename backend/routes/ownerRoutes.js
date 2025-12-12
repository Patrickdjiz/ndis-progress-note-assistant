// routes/ownerRoutes.js
const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../authMiddleware");
const bcrypt = require("bcryptjs");

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
// routes/ownerRoutes.js
router.post("/providers", (req, res) => {
  try {
    const {
      organisationName,
      adminEmail,
      adminFullName,
      adminPassword,
    } = req.body;

    if (
      !organisationName?.trim() ||
      !adminEmail?.trim() ||
      !adminFullName?.trim() ||
      !adminPassword?.trim()
    ) {
      return res.status(400).json({
        error:
          "organisationName, adminEmail, adminFullName and adminPassword are required",
      });
    }

    const normalisedEmail = adminEmail.trim().toLowerCase();
    const nowIso = new Date().toISOString();

    // NEW: check if email already exists anywhere
    const existingUser = db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .get(normalisedEmail);

    if (existingUser) {
      return res.status(400).json({
        error: "A user with this email already exists",
      });
    }

    // create org
    const orgStmt = db.prepare(`
      INSERT INTO organisations (name, status, createdAt)
      VALUES (?, 'ACTIVE', ?)
    `);
    const orgInfo = orgStmt.run(organisationName.trim(), nowIso);
    const orgId = orgInfo.lastInsertRowid;

    // create admin user
    const hash = bcrypt.hashSync(adminPassword.trim(), 10);
    const userStmt = db.prepare(`
      INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
      VALUES (?, ?, ?, 'ADMIN', ?, 1, ?)
    `);
    const adminInfo = userStmt.run(
      orgId,
      normalisedEmail,
      hash,
      adminFullName.trim(),
      nowIso
    );

    const organisation = {
      id: orgId,
      name: organisationName.trim(),
      status: "ACTIVE",
      createdAt: nowIso,
    };

    const admin = {
      id: adminInfo.lastInsertRowid,
      organisationId: orgId,
      email: normalisedEmail,
      fullName: adminFullName.trim(),
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

    const { status } = req.body || {};
    if (!["ACTIVE", "SUSPENDED"].includes(status)) {
      return res
        .status(400)
        .json({ error: "Status must be 'ACTIVE' or 'SUSPENDED'" });
    }

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

    const { isActive } = req.body || {};

    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json({ error: "isActive must be a boolean" });
    }

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

    // Don't let owner kill OWNER accounts (including themselves)
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
