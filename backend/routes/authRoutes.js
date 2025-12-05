// routes/authRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { generateToken, requireAuth, requireRole } = require("../authMiddleware");

const router = express.Router();

router.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalisedEmail = email.trim().toLowerCase();

    // IMPORTANT: join organisations to get org status
    const row = db
      .prepare(
        `
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
      `
      )
      .get(normalisedEmail);

    if (!row) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Block deactivated users
    if (!row.isActive) {
      return res
        .status(403)
        .json({ error: "This user account is inactive. Please contact your provider." });
    }

    // Block users from a suspended provider (but still allow OWNER)
    if (row.role !== "OWNER" && row.orgStatus !== "ACTIVE") {
      return res.status(403).json({
        error:
          "This provider account is suspended. Please contact the platform owner or your organisation.",
      });
    }

    const ok = bcrypt.compareSync(password, row.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(row);

    return res.json({
      token,
      user: {
        id: row.id,
        email: row.email,
        role: row.role,
        fullName: row.fullName,
        organisationId: row.organisationId,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});


// GET /api/auth/me  (who am I?)
router.get("/auth/me", requireAuth, (req, res) => {
  // req.user is set by requireAuth
  return res.json({
    user: {
      id: req.user.id,
      fullName: req.user.fullName,
      role: req.user.role,
      email: req.user.email,
      organisationId: req.user.organisationId
    }
  });
});

// POST /api/users  (create user in same org)
router.post(
  "/users",
  requireAuth,
  requireRole("ADMIN", "OWNER"),
  (req, res) => {
    try {
      const { fullName, email, password, role } = req.body || {};
      if (!fullName || !email || !password) {
        return res
          .status(400)
          .json({ error: "fullName, email and password are required" });
      }

      const newRole = role === "ADMIN" ? "ADMIN" : "WORKER";

      const nowIso = new Date().toISOString();
      const hash = bcrypt.hashSync(password, 10);

      const stmt = db.prepare(`
        INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `);

      const info = stmt.run(
        req.user.organisationId,
        email.toLowerCase(),
        hash,
        newRole,
        fullName,
        nowIso
      );

      return res.json({ ok: true, userId: info.lastInsertRowid });
    } catch (err) {
      console.error("Error creating user:", err.message);
      if (err.message.includes("UNIQUE constraint failed: users.email")) {
        return res.status(400).json({ error: "Email already in use" });
      }
      return res.status(500).json({ error: "Failed to create user" });
    }
  }
);

// GET /api/users  (list users in my organisation)
router.get(
  "/users",
  requireAuth,
  requireRole("ADMIN", "OWNER"),
  (req, res) => {
    try {
      const stmt = db.prepare(`
        SELECT id, fullName, email, role, isActive, createdAt
        FROM users
        WHERE organisationId = ?
        ORDER BY createdAt DESC
      `);
      const rows = stmt.all(req.user.organisationId);
      return res.json({ users: rows });
    } catch (err) {
      console.error("Error listing users:", err.message);
      return res.status(500).json({ error: "Failed to list users" });
    }
  }
);

module.exports = router;
