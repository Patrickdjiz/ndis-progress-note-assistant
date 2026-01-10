const express = require("express");
const bcrypt = require("bcryptjs");
const { requireAuth } = require("../authMiddleware"); // adjust path/name to your project
const { updateProfileSchema, updatePasswordSchema } = require("../validation");
const { updateUserProfile, query } = require("../dbAdapter"); // updateUserProfile already exists in dbAdapter

const sendErr = (res, req, status, msg) =>
  res.status(status).json({ error: msg, requestId: req.id });

const router = express.Router();


// POST /api/account/change-password
router.post("/account/change-password", requireAuth, async (req, res) => {
  try {
    const parsed = updatePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid request");
    }

    const { currentPassword, newPassword } = parsed.data;

    const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    if (!rows[0]) return sendErr(res, req, 404, "User not found");

    const ok = await bcrypt.compare(String(currentPassword), rows[0].password_hash);
    if (!ok) return sendErr(res, req, 401, "Current password is incorrect");

    const newHash = await bcrypt.hash(String(newPassword), 10);
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
    return sendErr(res, req, 500, "Failed to change password");
  }
});

// PATCH /api/account/profile
router.patch("/account/profile", requireAuth, async (req, res) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid request");
    }

    const { fullName, email } = parsed.data;

    if (!fullName && !email) {
      return sendErr(res, req, 400, "Nothing to update");
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
    return sendErr(res, req, 500, "Failed to update profile");
  }
});


module.exports = router;
