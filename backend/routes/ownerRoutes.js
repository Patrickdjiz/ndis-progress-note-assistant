// routes/ownerRoutes.js
const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../authMiddleware");

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
const bcrypt = require("bcryptjs");

router.post("/providers", (req, res) => {
  try {
    const { organisationName, adminEmail, adminFullName, adminPassword } =
      req.body || {};

    if (
      !organisationName ||
      !organisationName.trim() ||
      !adminEmail ||
      !adminEmail.trim() ||
      !adminFullName ||
      !adminFullName.trim() ||
      !adminPassword ||
      !adminPassword.trim()
    ) {
      return res.status(400).json({
        error:
          "organisationName, adminEmail, adminFullName and adminPassword are required",
      });
    }

    const nowIso = new Date().toISOString();
    const orgName = organisationName.trim();
    const email = adminEmail.trim().toLowerCase();
    const fullName = adminFullName.trim();
    const passwordHash = bcrypt.hashSync(adminPassword.trim(), 10);

    // Ensure org name is unique
    const existingOrg = db
      .prepare(`SELECT id FROM organisations WHERE name = ?`)
      .get(orgName);
    if (existingOrg) {
      return res
        .status(400)
        .json({ error: "An organisation with this name already exists" });
    }

    // Ensure email is unique
    const existingUser = db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .get(email);
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "A user with this email already exists" });
    }

    // Create org
    const orgInfo = db
      .prepare(
        `
      INSERT INTO organisations (name, status, createdAt)
      VALUES (?, 'ACTIVE', ?)
    `
      )
      .run(orgName, nowIso);

    const orgId = orgInfo.lastInsertRowid;

    // Create ADMIN
    const adminInfo = db
      .prepare(
        `
      INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
      VALUES (?, ?, ?, 'ADMIN', ?, 1, ?)
    `
      )
      .run(orgId, email, passwordHash, fullName, nowIso);

    res.status(201).json({
      organisation: {
        id: orgId,
        name: orgName,
        status: "ACTIVE",
        createdAt: nowIso,
      },
      admin: {
        id: adminInfo.lastInsertRowid,
        email,
        fullName,
        role: "ADMIN",
        isActive: 1,
        createdAt: nowIso,
      },
    });
  } catch (err) {
    console.error("Error in POST /api/owner/providers:", err.message);
    res.status(500).json({ error: "Failed to create provider" });
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
