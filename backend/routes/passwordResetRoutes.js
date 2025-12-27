const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const { query } = require("../dbAdapter");
const { forgotPasswordSchema, resetPasswordSchema } = require("../validation");
const { FRONTEND_ORIGIN } = require("../config/env");

const router = express.Router();

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

function buildTransportFromEnv() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid request" });
    }

    const email = parsed.data.email.trim().toLowerCase();

    // Always return ok to prevent email enumeration
    const okResponse = { ok: true, message: "If an account exists, you will receive an email shortly." };

    // Find eligible user (active user in active org)
    const { rows } = await query(
      `
      SELECT u.id, u.email
      FROM users u
      JOIN organisations o ON o.id = u.organisation_id
      WHERE lower(u.email) = lower($1)
        AND u.is_active = TRUE
        AND o.status = 'ACTIVE'
      LIMIT 1
      `,
      [email]
    );

    if (!rows[0]) {
      return res.json(okResponse);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = addMinutes(new Date(), 30).toISOString();

    await query(
      `
      UPDATE users
      SET reset_token_hash = $1,
          reset_token_expires_at = $2
      WHERE id = $3
      `,
      [tokenHash, expiresAt, rows[0].id]
    );

    const resetLink = `${FRONTEND_ORIGIN.replace(/\/+$/, "")}/reset-password?token=${rawToken}`;

    const transport = buildTransportFromEnv();
    const from = process.env.SMTP_FROM || "no-reply@ndis-ai-notes.local";

    if (!transport) {
      // Dev fallback: log the link
      console.log("PASSWORD RESET LINK (dev):", resetLink);
      return res.json(okResponse);
    }

    await transport.sendMail({
      from,
      to: rows[0].email,
      subject: "Reset your password",
      text: `Reset your password using this link (valid for 30 minutes):\n\n${resetLink}\n\nIf you did not request this, you can ignore this email.`,
    });

    return res.json(okResponse);
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Failed to start password reset" });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid request" });
    }

    const { token, newPassword } = parsed.data;

    const tokenHash = sha256Hex(token);

    const { rows } = await query(
      `
      SELECT id
      FROM users
      WHERE reset_token_hash = $1
        AND reset_token_expires_at IS NOT NULL
        AND reset_token_expires_at > NOW()
      LIMIT 1
      `,
      [tokenHash]
    );

    if (!rows[0]) {
      return res.status(400).json({ error: "Reset token is invalid or expired" });
    }

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
      [newHash, nowIso, rows[0].id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

module.exports = router;
