// routes/authRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { generateToken, requireAuth, requireRole } = require("../authMiddleware");

const router = express.Router();

// POST /api/auth/login
router.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const stmt = db.prepare(
    "SELECT * FROM users WHERE email = ? AND isActive = 1"
  );
  const user = stmt.get(email.toLowerCase());

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = generateToken(user);

  return res.json({
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      organisationId: user.organisationId
    }
  });
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
