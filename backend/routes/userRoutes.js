// routes/userRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole } = require("../authMiddleware");

const router = express.Router();

// All user routes require auth + ADMIN/OWNER
router.use(requireAuth);
router.use(requireRole("ADMIN", "OWNER"));

/**
 * GET /api/users
 * List team for the current organisation.
 * - ADMIN: sees themselves + all WORKERs in their org
 * - OWNER: we generally won't use this route (owner uses /api/owner/overview)
 */
router.get("/", (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, email, fullName, role, isActive, createdAt
      FROM users
      WHERE organisationId = ?
        AND (role = 'WORKER' OR id = ?)
      ORDER BY role DESC, createdAt DESC
    `);

    const rows = stmt.all(req.user.organisationId, req.user.id);
    res.json({ users: rows });
  } catch (err) {
    console.error("Error listing users:", err.message);
    res.status(500).json({ error: "Failed to list users" });
  }
});

/**
 * POST /api/users
 * Create a new WORKER in the current organisation.
 * Provider admins CANNOT create other admins from here.
 */
router.post("/", (req, res) => {
  try {
    const { email, fullName, password } = req.body;

    if (!email || !fullName || !password) {
      return res
        .status(400)
        .json({ error: "email, fullName and password are required" });
    }

    const normalisedEmail = email.trim().toLowerCase();

    const existing = db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .get(normalisedEmail);
    if (existing) {
      return res
        .status(400)
        .json({ error: "A user with this email already exists" });
    }

    const hash = bcrypt.hashSync(password.trim(), 10);
    const nowIso = new Date().toISOString();

    // Force role = WORKER, ignore any "role" in body
    const stmt = db.prepare(`
      INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
      VALUES (?, ?, ?, 'WORKER', ?, 1, ?)
    `);

    const info = stmt.run(
      req.user.organisationId,
      normalisedEmail,
      hash,
      fullName.trim(),
      nowIso
    );

    res.status(201).json({
      user: {
        id: info.lastInsertRowid,
        email: normalisedEmail,
        fullName: fullName.trim(),
        role: "WORKER",
        isActive: 1,
        createdAt: nowIso,
      },
    });
  } catch (err) {
    console.error("Error creating user:", err.message);
    res.status(500).json({ error: "Failed to create user" });
  }
});

/**
 * PATCH /api/users/:id/status
 * Toggle active / inactive for WORKERs only.
 */
router.patch("/:id/status", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const { isActive } = req.body;
    const activeFlag = isActive ? 1 : 0;

    // Can't change your own status
    if (id === req.user.id) {
      return res
        .status(400)
        .json({ error: "You cannot change your own status" });
    }

    // Ensure user is in same org AND is a WORKER
    const existing = db
      .prepare(
        `SELECT id, role FROM users WHERE id = ? AND organisationId = ?`
      )
      .get(id, req.user.organisationId);

    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }
    if (existing.role !== "WORKER") {
      return res.status(400).json({
        error: "You can only change worker accounts from the team screen",
      });
    }

    db.prepare(`UPDATE users SET isActive = ? WHERE id = ?`).run(
      activeFlag,
      id
    );

    res.json({ ok: true, id, isActive: activeFlag });
  } catch (err) {
    console.error("Error updating user status:", err.message);
    res.status(500).json({ error: "Failed to update user status" });
  }
});

module.exports = router;
