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


const router = express.Router();

// POST /api/login
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid login data" });
    }

    const { email, password } = parsed.data;

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
        mustChangePassword: !!row.mustChangePassword,
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

// PATCH /api/auth/profile
router.patch("/auth/profile", requireAuth, async (req, res) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid profile data" });
    }

    const nextEmail = parsed.data.email?.trim().toLowerCase();
    const nextFullName = parsed.data.fullName?.trim();

    await updateUserProfile(req.user.id, {
      email: nextEmail,
      fullName: nextFullName,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Profile update error:", err.message);
    return res.status(err.status || 500).json({ error: err.message || "Failed to update profile" });
  }
});

// PATCH /api/auth/password
router.patch("/auth/password", requireAuth, async (req, res) => {
  try {
    const parsed = updatePasswordSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid password data" });
    }

    const { currentPassword, newPassword } = parsed.data;

    const user = await getUserAuthById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const ok = bcrypt.compareSync(currentPassword, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    await updateUserPasswordHash(req.user.id, hash);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Password update error:", err.message);
    return res.status(500).json({ error: "Failed to update password" });
  }
});


module.exports = router;
