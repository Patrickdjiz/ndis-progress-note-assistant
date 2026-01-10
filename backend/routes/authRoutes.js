// routes/authRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { generateToken, requireAuth } = require("../authMiddleware");
const {
  findUserByEmailWithOrg,
  getUserAuthById,
  updateUserPasswordHash,
  updateUserProfile,
} = require("../dbAdapter");
const {
  loginSchema,
  updatePasswordSchema,
  updateProfileSchema,
} = require("../validation");
const crypto = require("crypto");

const sendErr = (res, req, status, msg) =>
  res.status(status).json({ error: msg, requestId: req.id });

const router = express.Router();

// POST /api/login
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid login data");
    }

    const { email, password } = parsed.data;

    const normalisedEmail = email.trim().toLowerCase();

    // ✅ Use adapter (Postgres)
    const row = await findUserByEmailWithOrg(normalisedEmail);

    if (!row) {
      return sendErr(res, req, 401, "Invalid email or password");
    }

    // Block deactivated users
    if (!row.isActive) {
      return sendErr(res, req, 403, "This user account is inactive.");
    }

    // Block users from a suspended provider (but still allow OWNER)
    if (row.role !== "OWNER" && row.orgStatus !== "ACTIVE") {
      return sendErr(res, req, 403, "This provider account is suspended.");
    }

    const ok = await bcrypt.compare(password, row.passwordHash);
    if (!ok) {
      return sendErr(res, req, 401, "Invalid email or password");
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
        mustChangePassword: !!row.mustChangePassword,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return sendErr(res, req, 500, "Login failed");
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
