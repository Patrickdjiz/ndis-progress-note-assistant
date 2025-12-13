// routes/authRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { generateToken, requireAuth, requireRole } = require("../authMiddleware");
const { loginSchema } = require("../validation");


const router = express.Router();

router.post("/login", (req, res) => {
  try {
    // ✅ Validate body
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid login data" });
    }

    const { email, password } = parsed.data;

    const normalisedEmail = email.trim().toLowerCase();

    // (rest of your existing logic stays the same)
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

module.exports = router;
