// routes/passwordResetRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { sendMail } = require("../mailer");
const { query } = require("../dbAdapter");
const { forgotPasswordSchema, resetPasswordSchema } = require("../validation");
const { FRONTEND_ORIGIN } = require("../config/env");
const { auditEvent } = require("../audit");
const { rateLimit, makeStore, limiterHandler, ipKeyGenerator } = require("../rateLimit");

const router = express.Router();

const sendErr = (res, req, status, msg) =>
  res.status(status).json({ error: msg, requestId: req.id });

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s || "")).digest("hex");
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

// ----- rate limiters -----
const ipKey = (req, res) => ipKeyGenerator(req, res);

const emailKey = (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return ipKey(req, res);
  return `e:${sha256Hex(email)}`;
};

const tokenKey = (req, res) => {
  const token = String(req.body?.token || "");
  if (!token) return ipKey(req, res);
  return `t:${sha256Hex(token)}`;
};

const forgotIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:auth:forgot:ip:"),
  keyGenerator: ipKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many password reset requests from this network. Please slow down." },
});

const forgotEmailLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:auth:forgot:email:"),
  keyGenerator: emailKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many password reset requests for this account. Please wait and try again." },
});

const resetIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:auth:reset:ip:"),
  keyGenerator: ipKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many reset attempts from this network. Please slow down." },
});

const resetTokenLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:auth:reset:token:"),
  keyGenerator: tokenKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many reset attempts for this token. Please wait and try again." },
});

// POST /api/forgot-password
router.post("/forgot-password", forgotIpLimiter, forgotEmailLimiter, async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid request");
    }

    const email = parsed.data.email.trim().toLowerCase();
    const emailHash = sha256Hex(email);

    // Always audit the request (no enumeration)
    await auditEvent(req, "PASSWORD_RESET_REQUESTED", {
      actorRole: "ANON",
      targetType: "auth",
      targetId: null,
      meta: { emailHash },
    });

    const okResponse = {
      ok: true,
      message: "If an account exists, you will receive an email shortly.",
    };

    const { rows } = await query(
      `
      SELECT u.id, u.email, u.organisation_id
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

    // Token issued (actor is still anonymous, target is the account)
    await auditEvent(req, "PASSWORD_RESET_TOKEN_ISSUED", {
      organisationId: rows[0].organisation_id,
      actorRole: "ANON",
      targetType: "user",
      targetId: String(rows[0].id),
      meta: { emailHash },
    });

    const brandName = "NDIS Notes";
    const supportEmail = process.env.MAIL_REPLY_TO || "support@ndisnotes.com";
    const from = process.env.MAIL_FROM || `${brandName} <no-reply@ndisnotes.com>`;
    const replyTo = supportEmail;

    const subject = "Reset your NDIS Notes password";
    const preview = "Reset your password (link valid for 30 minutes).";

    const text =
      `${brandName}\n\n` +
      `We received a request to reset your password.\n\n` +
      `Reset link (valid for 30 minutes, one-time use):\n${resetLink}\n\n` +
      `If you did not request this, you can ignore this email.\n` +
      `Need help? Reply to this email or contact ${supportEmail}\n`;

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${preview}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);">
            <tr>
              <td style="padding:18px 20px;background:#111827;color:#ffffff;">
                <div style="font-size:16px;font-weight:700;">${brandName}</div>
                <div style="font-size:12px;opacity:.9;margin-top:4px;">Password reset request</div>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 20px;">
                <h1 style="font-size:18px;margin:0 0 10px 0;">Reset your password</h1>
                <p style="margin:0 0 14px 0;line-height:1.5;color:#374151;">
                  We received a request to reset your password. This link is valid for <strong>30 minutes</strong> and can be used <strong>once</strong>.
                </p>

                <div style="margin:18px 0;">
                  <a href="${resetLink}"
                    style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:999px;font-weight:700;font-size:14px;">
                    Reset password
                  </a>
                </div>

                <p style="margin:0 0 10px 0;line-height:1.5;color:#6b7280;font-size:12px;">
                  If the button doesn’t work, copy and paste this link into your browser:
                </p>
                <p style="margin:0 0 16px 0;word-break:break-all;font-size:12px;">
                  <a href="${resetLink}" style="color:#1d4ed8;">${resetLink}</a>
                </p>

                <p style="margin:0;line-height:1.5;color:#6b7280;font-size:12px;">
                  If you didn’t request this, you can ignore this email — your password will not change unless the link is used.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">
                Need help? Reply to this email or contact <a href="mailto:${supportEmail}" style="color:#1d4ed8;">${supportEmail}</a>
              </td>
            </tr>
          </table>

          <div style="font-size:11px;color:#9ca3af;margin-top:10px;">
            © ${new Date().getFullYear()} ${brandName}
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    let sent = false;

    try {
      await sendMail({ to: rows[0].email, from, replyTo, subject, text, html });
      sent = true;
    } catch (e) {
      console.error("Password reset email failed:", e?.message || e);

      await auditEvent(req, "PASSWORD_RESET_EMAIL_FAILED", {
        organisationId: rows[0].organisation_id,
        actorRole: "ANON",
        targetType: "user",
        targetId: String(rows[0].id),
        meta: { error: String(e?.message || e).slice(0, 200) },
      });

      if (process.env.NODE_ENV !== "production") {
        console.log("PASSWORD RESET LINK (dev):", resetLink);
      }
    }

    if (sent) {
      await auditEvent(req, "PASSWORD_RESET_EMAIL_SENT", {
        organisationId: rows[0].organisation_id,
        actorRole: "ANON",
        targetType: "user",
        targetId: String(rows[0].id),
      });
    }

    return res.json(okResponse);
  } catch (err) {
    console.error("Forgot password error:", err);
    return sendErr(res, req, 500, "Failed to start password reset");
  }
});

// POST /api/reset-password
router.post("/reset-password", resetIpLimiter, resetTokenLimiter, async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid request");
    }

    const { token, newPassword } = parsed.data;
    const tokenHash = sha256Hex(token);

    const { rows } = await query(
      `
      SELECT u.id, u.organisation_id
      FROM users u
      JOIN organisations o ON o.id = u.organisation_id
      WHERE u.reset_token_hash = $1
        AND u.reset_token_expires_at IS NOT NULL
        AND u.reset_token_expires_at > NOW()
        AND u.is_active = TRUE
        AND o.status = 'ACTIVE'
      LIMIT 1
      `,
      [tokenHash]
    );

    if (!rows[0]) {
      return sendErr(res, req, 400, "Reset token is invalid or expired");
    }

    const newHash = await bcrypt.hash(String(newPassword), 10);
    const nowIso = new Date().toISOString();

    const result = await query(
      `
      UPDATE users u
      SET password_hash = $1,
          must_change_password = FALSE,
          password_changed_at = $2,
          session_revoked_at = now(),
          reset_token_hash = NULL,
          reset_token_expires_at = NULL,
          updated_at = now()
      FROM organisations o
      WHERE u.id = $3
        AND o.id = u.organisation_id
        AND u.is_active = TRUE
        AND o.status = 'ACTIVE'
      `,
      [newHash, nowIso, rows[0].id]
    );


    const changed = result?.rowCount ?? result?.changes ?? 0;
    if (!changed) {
      return sendErr(res, req, 400, "Reset token is invalid or expired");
    }

    await auditEvent(req, "PASSWORD_RESET_COMPLETED", {
      organisationId: rows[0].organisation_id,
      actorRole: "ANON",
      targetType: "user",
      targetId: String(rows[0].id),
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return sendErr(res, req, 500, "Failed to reset password");
  }
});

module.exports = router;
