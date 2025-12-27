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

router.post("/auth/request-password-reset", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.json({ ok: true });

  // Always respond ok (avoid account enumeration)
  try {
    const { rows } = await query(
      `SELECT id, is_active FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );

    if (!rows[0] || !rows[0].is_active) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await query(
      `UPDATE users
       SET reset_token_hash = $1, reset_token_expires_at = $2
       WHERE id = $3`,
      [tokenHash, expiresAt, rows[0].id]
    );

    // TODO: send email (production: SES/SendGrid/Mailgun)
    // Reset link should go to your frontend route:
    // `${FRONTEND_ORIGIN}/reset-password?email=${encodeURIComponent(email)}&token=${token}`
    if (process.env.NODE_ENV !== "production") {
      console.log("PASSWORD RESET LINK:", `http://localhost:5173/reset-password?email=${encodeURIComponent(email)}&token=${token}`);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("request-password-reset error:", err);
    return res.json({ ok: true });
  }
});

router.post("/auth/reset-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const token = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: "Missing email, token, or newPassword" });
  }

  // enforce your unified policy here
  if (newPassword.trim().length < 10) {
    return res.status(400).json({ error: "Password must be at least 10 characters" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const { rows } = await query(
    `SELECT id, reset_token_hash, reset_token_expires_at
     FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email]
  );

  const u = rows[0];
  if (!u || !u.reset_token_hash || !u.reset_token_expires_at) {
    return res.status(400).json({ error: "Invalid or expired reset token" });
  }

  const expired = new Date(u.reset_token_expires_at).getTime() < Date.now();
  if (expired || u.reset_token_hash !== tokenHash) {
    return res.status(400).json({ error: "Invalid or expired reset token" });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  const nowIso = new Date().toISOString();

  await query(
    `UPDATE users
     SET password_hash = $1,
         must_change_password = FALSE,
         password_changed_at = $2,
         reset_token_hash = NULL,
         reset_token_expires_at = NULL
     WHERE id = $3`,
    [hash, nowIso, u.id]
  );

  return res.json({ ok: true });
});

module.exports = router;
