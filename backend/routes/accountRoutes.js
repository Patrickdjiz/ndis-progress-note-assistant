const express = require("express");
const bcrypt = require("bcryptjs");
const { requireAuth } = require("../authMiddleware"); // adjust path/name to your project
const { updateProfileSchema, updatePasswordSchema } = require("../validation");
const { updateUserProfile, query } = require("../dbAdapter"); // updateUserProfile already exists in dbAdapter


const router = express.Router();

// GET /api/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `
      SELECT
        id,
        email,
        role,
        full_name AS "fullName",
        organisation_id AS "organisationId",
        must_change_password AS "mustChangePassword"
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error("GET /me error:", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

// POST /api/account/change-password
router.post("/account/change-password", requireAuth, async (req, res) => {
  try {
    const parsed = updatePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid request" });
    }

    const { currentPassword, newPassword } = parsed.data;

    const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: "User not found" });

    const ok = bcrypt.compareSync(String(currentPassword), rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

    const newHash = bcrypt.hashSync(String(newPassword), 10);
    const nowIso = new Date().toISOString();

    await query(
      `
      UPDATE users
      SET password_hash = $1,
          must_change_password = FALSE,
          password_changed_at = $2,
          reset_token_hash = NULL,
          reset_token_expires_at = NULL
      WHERE id = $3
      `,
      [newHash, nowIso, req.user.id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ error: "Failed to change password" });
  }
});

// PATCH /api/account/profile
router.patch("/account/profile", requireAuth, async (req, res) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid request" });
    }

    const { fullName, email } = parsed.data;

    if (!fullName && !email) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    await updateUserProfile(req.user.id, {
      fullName: fullName?.trim(),
      email: email?.trim(),
    });

    // return updated user snapshot
    const { rows } = await query(
      `
      SELECT
        id,
        email,
        role,
        full_name AS "fullName",
        organisation_id AS "organisationId",
        must_change_password AS "mustChangePassword",
        password_changed_at AS "passwordChangedAt"
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    return res.json({ ok: true, user: rows[0] });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to update profile" });
  }
});


module.exports = router;
