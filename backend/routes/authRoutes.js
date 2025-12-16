// routes/authRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { generateToken, requireAuth } = require("../authMiddleware");
const { findUserByEmailWithOrg } = require("../dbAdapter");

const router = express.Router();

// POST /api/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required" });
    }

    const normalisedEmail = email.trim().toLowerCase();

    // ✅ Use adapter (Postgres)
    const row = await findUserByEmailWithOrg(normalisedEmail);

    if (!row) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Block deactivated users
    if (!row.isActive) {
      return res.status(403).json({
        error:
          "This user account is inactive. Please contact your provider.",
      });
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
      organisationId: req.user.organisationId,
    },
  });
});

module.exports = router;
