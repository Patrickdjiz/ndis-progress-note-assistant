// routes/userRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { requireAuth, requireRole } = require("../authMiddleware");
const {
  createWorkerSchema,
  booleanFlagSchema,
} = require("../validation");
const {
  findUserByEmail,
  getOrgUsersForAdmin,
  createWorkerUser,
  findUserByIdInOrg,
  updateUserActiveFlag,
  query,
} = require("../dbAdapter");
const { audit } = require("../audit");
const crypto = require("crypto");
const sha256Hex = (s) => crypto.createHash("sha256").update(String(s || "")).digest("hex");
const { sendMail } = require("../mailer");
const { FRONTEND_ORIGIN } = require("../config/env");


const sendErr = (res, req, status, msg) =>
  res.status(status).json({ error: msg, requestId: req.id });

const router = express.Router();

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}


// All user routes require auth + ADMIN
router.use(requireAuth);
router.use(requireRole(["ADMIN"]));


router.use((req, res, next) => {
  if (req.user?.mustChangePassword) {
    return sendErr(res, req, 403, "You must change your password before continuing.");
  }
  next();
});


/**
 * GET /api/users
 * List team for the current organisation.
 * - ADMIN: sees themselves + all WORKERs in their org
 * - OWNER: we generally won't use this route (owner uses /api/owner/overview)
 */
router.get("/", async (req, res) => {
  try {
    const users = await getOrgUsersForAdmin(
      req.user.organisationId,
      req.user.id
    );
    return res.json({ users });
  } catch (err) {
    console.error("Error listing users:", err.message);
    return sendErr(res, req, 500, "Failed to list users");
  }
});

/**
 * POST /api/users
 * Create a new WORKER in the current organisation.
 * Provider admins CANNOT create other admins from here.
 */
router.post("/", async (req, res) => {
  try {
    // ✅ Validate body with Zod schema
    const parsed = createWorkerSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid user data");
    }

    const { email, fullName, password } = parsed.data;
    const normalisedEmail = email.trim().toLowerCase();

    // Check uniqueness across DB
    const existing = await findUserByEmail(normalisedEmail);
    if (existing) {
      return sendErr(res, req, 400, "A user with this email already exists");
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await createWorkerUser({
      orgId: req.user.organisationId,
      email: normalisedEmail,
      fullName: fullName.trim(),
      passwordHash: hash,
    });

    await audit(req, "USER_CREATED", {
      targetType: "user",
      targetId: String(user.id),
      meta: { role: "WORKER", emailHash: sha256Hex(normalisedEmail) },
    });


    return res.status(201).json({ user });
  } catch (err) {
    console.error("Error creating user:", err.message);
    return sendErr(res, req, 500, "Failed to create user");
  }
});

/**
 * PATCH /api/users/:id/status
 * Toggle active / inactive for WORKERs only.
 */
router.patch("/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid user id");
    }

    // ✅ Validate body
    const parsed = booleanFlagSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid status data");
    }

    const { isActive } = parsed.data;

    // Can't change your own status
    if (id === req.user.id) {
      return sendErr(res, req, 400, "You cannot change your own status");
    }

    // Ensure user is in same org AND is a WORKER
    const existing = await findUserByIdInOrg(
      id,
      req.user.organisationId
    );

    if (!existing) {
      return sendErr(res, req, 404, "User not found");
    }
    if (existing.role !== "WORKER") {
      return sendErr(res, req, 400, "You can only change worker accounts from the team screen");
    }

    await updateUserActiveFlag(id, !!isActive);

    await audit(req, isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED", {
      targetType: "user",
      targetId: String(id),
      meta: { role: "WORKER" },
    });


    return res.json({ ok: true, id, isActive: !!isActive });
  } catch (err) {
    console.error("Error updating user status:", err.message);
    return sendErr(res, req, 500, "Failed to update user status");
  }
});

/**
 * POST /api/users/:id/reset-password
 * ADMIN can trigger a reset email for a WORKER in their org.
 */
router.post("/:id/reset-password", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid user id");
    }

    // Admin cannot reset their own password via this route
    if (id === req.user.id) {
      return sendErr(res, req, 400, "You cannot reset your own password from here");
    }

    // Must be same org and must be a WORKER
    const { rows } = await query(
      `
      SELECT
        u.id,
        u.email,
        u.full_name AS "fullName",
        u.role,
        u.is_active AS "isActive",
        u.organisation_id AS "organisationId",
        o.status AS "orgStatus"
      FROM users u
      JOIN organisations o ON o.id = u.organisation_id
      WHERE u.id = $1
        AND u.organisation_id = $2
      LIMIT 1
      `,
      [id, req.user.organisationId]
    );

    const u = rows[0];
    if (!u) return sendErr(res, req, 404, "User not found");
    if (u.role !== "WORKER") {
      return sendErr(res, req, 400, "You can only reset passwords for worker accounts");
    }
    if (!u.isActive) {
      return sendErr(res, req, 400, "This user account is inactive");
    }
    if (u.orgStatus !== "ACTIVE") {
      return sendErr(res, req, 400, "Organisation is not active");
    }

    // Issue a one-time reset token (hashed in DB)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = addMinutes(new Date(), 30).toISOString();

    await query(
      `
      UPDATE users
      SET reset_token_hash = $1,
          reset_token_expires_at = $2,
          updated_at = now()
      WHERE id = $3
      `,
      [tokenHash, expiresAt, u.id]
    );

    await query(
      `UPDATE users SET session_revoked_at = now(), updated_at = now() WHERE id = $1`,
      [u.id]
    );

    const resetLink = `${FRONTEND_ORIGIN.replace(/\/+$/, "")}/reset-password?token=${rawToken}`;

    // Audit: admin initiated reset token
    await audit(req, "ADMIN_PASSWORD_RESET_TOKEN_ISSUED", {
      targetType: "user",
      targetId: String(u.id),
      meta: { role: "WORKER", emailHash: sha256Hex(String(u.email || "").toLowerCase()) },
    });

    // Email
    const brandName = "NDIS Notes";
    const supportEmail = process.env.MAIL_REPLY_TO || "support@ndisnotes.com";
    const from = process.env.MAIL_FROM || `${brandName} <no-reply@ndisnotes.com>`;
    const replyTo = supportEmail;

    const subject = "Reset your NDIS Notes password";
    const preview = "Your administrator requested a password reset (link valid for 30 minutes).";

    const text =
      `${brandName}\n\n` +
      `Your organisation administrator requested a password reset for your account.\n\n` +
      `Reset link (valid for 30 minutes, one-time use):\n${resetLink}\n\n` +
      `If you did not request this, contact your administrator or reply to this email.\n` +
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
                <div style="font-size:12px;opacity:.9;margin-top:4px;">Password reset</div>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 20px;">
                <h1 style="font-size:18px;margin:0 0 10px 0;">Reset your password</h1>
                <p style="margin:0 0 14px 0;line-height:1.5;color:#374151;">
                  Your organisation administrator requested a password reset for your account.
                  This link is valid for <strong>30 minutes</strong> and can be used <strong>once</strong>.
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
                  If you didn’t request this, contact your administrator or reply to this email.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">
                Need help? Reply to this email or contact <a href="mailto:${supportEmail}" style="color:#1d4ed8;">${supportEmail}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    try {
      await sendMail({ to: u.email, from, replyTo, subject, text, html });
      await audit(req, "ADMIN_PASSWORD_RESET_EMAIL_SENT", {
        targetType: "user",
        targetId: String(u.id),
      });
    } catch (e) {
      await audit(req, "ADMIN_PASSWORD_RESET_EMAIL_FAILED", {
        targetType: "user",
        targetId: String(u.id),
        meta: { error: String(e?.message || e).slice(0, 200) },
      });

      // Don’t leak details to client; just say it failed.
      return sendErr(res, req, 500, "Failed to send reset email");
    }

    // Optional DEV convenience: only if explicitly enabled
    const expose = process.env.EXPOSE_RESET_LINKS === "true" && process.env.NODE_ENV !== "production";

    return res.json({
      ok: true,
      message: "Reset link sent to the user.",
      ...(expose ? { resetLink } : {}),
    });
  } catch (err) {
    console.error("Admin reset error:", err);
    return sendErr(res, req, 500, "Failed to start password reset");
  }
});


module.exports = router;
