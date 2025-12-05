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
 * List all users in the current organisation
 */
router.get("/", (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, email, fullName, role, isActive, createdAt
      FROM users
      WHERE organisationId = ?
      ORDER BY createdAt DESC
    `);
    const rows = stmt.all(req.user.organisationId);
    res.json({ users: rows });
  } catch (err) {
    console.error("Error listing users:", err.message);
    res.status(500).json({ error: "Failed to list users" });
  }
});

/**
 * POST /api/users
 * Create a new user (ADMIN or WORKER)
 * body: { email, fullName, role, password }
 */
router.post("/", (req, res) => {
  try {
    const { email, fullName, role, password } = req.body;

    if (!email || !fullName || !role || !password) {
      return res
        .status(400)
        .json({ error: "email, fullName, role and password are required" });
    }

    if (!["ADMIN", "WORKER"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const existing = db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .get(email.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: "A user with this email already exists" });
    }

    const hash = bcrypt.hashSync(password, 10);
    const nowIso = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);

    const info = stmt.run(
      req.user.organisationId,
      email.trim().toLowerCase(),
      hash,
      role,
      fullName.trim(),
      nowIso
    );

    res.status(201).json({
      user: {
        id: info.lastInsertRowid,
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        role,
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
 * Toggle active / inactive
 * body: { isActive }
 */
router.patch("/:id/status", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const { isActive } = req.body;
    const activeFlag = isActive ? 1 : 0;

    // Can't deactivate yourself
    if (id === req.user.id) {
      return res.status(400).json({ error: "You cannot change your own status" });
    }

    // Ensure user is in same organisation
    const existing = db
      .prepare(
        `SELECT id FROM users WHERE id = ? AND organisationId = ?`
      )
      .get(id, req.user.organisationId);

    if (!existing) {
      return res.status(404).json({ error: "User not found" });
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
