const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../dbAdapter");
const { requireAuth } = require("../authMiddleware"); // adjust path/name to your project

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
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }
    if (String(newPassword).trim().length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    const { rows } = await query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [req.user.id]
    );
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

module.exports = router;
