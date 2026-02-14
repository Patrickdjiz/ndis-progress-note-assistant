// routes/ownerRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { requireAuth, requireRole } = require("../authMiddleware");
const {
  createProviderSchema,
  booleanFlagSchema,
  orgStatusSchema,
} = require("../validation");
const { query } = require("../dbAdapter");
const { pool } = require("../pgClient");
const { auditEvent } = require("../audit");
const crypto = require("crypto");
const { sendMail } = require("../mailer");
const { FRONTEND_ORIGIN } = require("../config/env");

const router = express.Router();

const sendErr = (res, req, status, msg) =>
  res.status(status).json({ error: msg, requestId: req.id });


const sha256Hex = (s) => crypto.createHash("sha256").update(String(s || "")).digest("hex");

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

function makeInviteEmail({ adminFullName, resetLink }) {
  const brandName = "NDIS Notes";
  const supportEmail = process.env.MAIL_REPLY_TO || "support@ndisnotes.com";
  const from = process.env.MAIL_FROM || `${brandName} <no-reply@ndisnotes.com>`;
  const replyTo = supportEmail;

  const subject = "Set up your NDIS Notes admin account";
  const preview = "You’ve been invited to NDIS Notes. Set your password to get started.";

  const text =
    `${brandName}\n\n` +
    `Hi ${adminFullName || "there"},\n\n` +
    `You’ve been invited as an administrator. Set your password using this link (valid for 7 days):\n` +
    `${resetLink}\n\n` +
    `If you didn’t expect this invite, ignore this email or contact support.\n` +
    `Support: ${supportEmail}\n`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${subject}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0"
        style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);">
        <tr><td style="padding:18px 20px;background:#111827;color:#ffffff;">
          <div style="font-size:16px;font-weight:700;">${brandName}</div>
          <div style="font-size:12px;opacity:.9;margin-top:4px;">Admin invite</div>
        </td></tr>
        <tr><td style="padding:22px 20px;">
          <h1 style="font-size:18px;margin:0 0 10px 0;">Set up your admin account</h1>
          <p style="margin:0 0 14px 0;line-height:1.5;color:#374151;">
            Click below to set your password. This link is valid for <strong>7 days</strong> and can be used <strong>once</strong>.
          </p>
          <div style="margin:18px 0;">
            <a href="${resetLink}"
              style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:999px;font-weight:700;font-size:14px;">
              Set password
            </a>
          </div>
          <p style="margin:0 0 10px 0;line-height:1.5;color:#6b7280;font-size:12px;">
            If the button doesn’t work, copy and paste this link:
          </p>
          <p style="margin:0 0 16px 0;word-break:break-all;font-size:12px;">
            <a href="${resetLink}" style="color:#1d4ed8;">${resetLink}</a>
          </p>
          <p style="margin:0;line-height:1.5;color:#6b7280;font-size:12px;">
            If you didn’t expect this invite, you can ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding:14px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">
          Need help? Reply to this email or contact <a href="mailto:${supportEmail}" style="color:#1d4ed8;">${supportEmail}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { from, replyTo, subject, text, html };
}

// All routes here: must be logged in + OWNER
router.use(requireAuth);
router.use(requireRole("OWNER"));

router.use((req, res, next) => {
  if (req.user?.mustChangePassword) {
    return sendErr(res, req, 403, "You must change your password before continuing.");  
  }
  next();
});


/**
 * GET /api/owner/overview
 * Returns all organisations + their users (admins + workers)
 */
router.get("/overview", async (req, res) => {
  try {
    const { rows: orgs } = await query(
      `
      SELECT
        id,
        name,
        status,
        created_at AS "createdAt"
      FROM organisations
      ORDER BY created_at DESC
    `
    );

    const results = [];
    for (const org of orgs) {
      const { rows: users } = await query(
        `
        SELECT
          id,
          email,
          full_name AS "fullName",
          role,
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE organisation_id = $1
        ORDER BY role DESC, created_at DESC
      `,
        [org.id]
      );

      results.push({
        ...org,
        users,
      });
    }

    return res.json({ organisations: results });
  } catch (err) {
    console.error("Error in /api/owner/overview:", err);
    return sendErr(res, req, 500, "Failed to load overview");
  }
});

/**
 * POST /api/owner/providers
 * Body: { organisationName, adminEmail, adminFullName }
 * Creates an organisation + ADMIN user (transactional)
 */
router.post("/providers", async (req, res) => {
  try {
    // ✅ Validate body with Zod
    const parsed = createProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid provider data");
    }

    const { organisationName, adminEmail, adminFullName } = parsed.data;

    const trimmedOrgName = organisationName.trim();
    const normalisedEmail = adminEmail.trim().toLowerCase();
    const trimmedFullName = adminFullName.trim();
    const nowIso = new Date().toISOString();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Existing user with same email?
      const existingUser = await client.query(
        `SELECT id FROM users WHERE lower(email) = lower($1)`,
        [normalisedEmail]
      );
      if (existingUser.rows.length > 0) {
        await client.query("ROLLBACK");
        return sendErr(res, req, 400, "A user with this email already exists");
      }

      // Existing org with same name?
      const existingOrg = await client.query(
        `SELECT id FROM organisations WHERE name = $1`,
        [trimmedOrgName]
      );
      if (existingOrg.rows.length > 0) {
        await client.query("ROLLBACK");
        return sendErr(res, req, 400, "An organisation with this name already exists");
      }

      // 1) Create org
      const orgRes = await client.query(
        `
        INSERT INTO organisations (name, status, created_at)
        VALUES ($1, 'ACTIVE', $2)
        RETURNING id, name, status, created_at AS "createdAt"
      `,
        [trimmedOrgName, nowIso]
      );
      const organisation = orgRes.rows[0];

    // 7 days
const INVITE_MINUTES = 7 * 24 * 60;

const rawToken = crypto.randomBytes(32).toString("hex");
const tokenHash = sha256Hex(rawToken);
const expiresAt = addMinutes(new Date(), INVITE_MINUTES).toISOString();

// random password nobody knows (admin will set real password via reset link)
const randomSecret = crypto.randomBytes(32).toString("hex");
const passwordHash = await bcrypt.hash(randomSecret, 10);

// ... inside your transaction, AFTER org created:
const adminRes = await client.query(
  `
  INSERT INTO users (
    organisation_id,
    email,
    password_hash,
    role,
    full_name,
    is_active,
    must_change_password,
    reset_token_hash,
    reset_token_expires_at,
    created_at
  )
  VALUES ($1, $2, $3, 'ADMIN', $4, TRUE, TRUE, $5, $6, $7)
  RETURNING
    id,
    organisation_id AS "organisationId",
    email,
    full_name AS "fullName",
    role,
    is_active AS "isActive",
    must_change_password AS "mustChangePassword",
    created_at AS "createdAt"
  `,
  [organisation.id, normalisedEmail, passwordHash, trimmedFullName, tokenHash, expiresAt, nowIso]
);

const admin = adminRes.rows[0];


      await client.query("COMMIT");

      await auditEvent(req, "PROVIDER_CREATED", {
  organisationId: organisation.id,     // ✅ created organisation
  actorUserId: req.user.id,
  actorRole: req.user.role,
  targetType: "organisation",
  targetId: String(organisation.id),
  meta: { organisationName: organisation.name, adminUserId: admin.id },
});

const resetLink = `${FRONTEND_ORIGIN.replace(/\/+$/, "")}/reset-password?token=${rawToken}`;
const mail = makeInviteEmail({ adminFullName: trimmedFullName, resetLink });

try {
  await sendMail({ to: normalisedEmail, ...mail });

  await auditEvent(req, "ADMIN_INVITED", {
    organisationId: organisation.id,
    actorUserId: req.user.id,
    actorRole: req.user.role,
    targetType: "user",
    targetId: String(admin.id),
  });
} catch (e) {
  console.error("Admin invite email failed:", e?.message || e);

  await auditEvent(req, "ADMIN_INVITE_EMAIL_FAILED", {
    organisationId: organisation.id,
    actorUserId: req.user.id,
    actorRole: req.user.role,
    targetType: "user",
    targetId: String(admin.id),
    meta: { error: String(e?.message || e).slice(0, 200) },
  });

  // You can choose whether to return 500 or still return 201 with a warning.
  // Returning 201 prevents “org exists” issues on retry.
}




      return res.status(201).json({ organisation, admin });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error creating provider:", err);
      return sendErr(res, req, 500, "Failed to create provider");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error in POST /api/owner/providers:", err);
    return sendErr(res, req, 500, "Failed to create provider");
  }
});

/**
 * PATCH /api/owner/organisations/:id/status
 * body: { status: 'ACTIVE' | 'SUSPENDED' }
 */
router.patch("/organisations/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid organisation id");
    }

    const parsed = orgStatusSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid status data");
    }
    const { status } = parsed.data;

    const { rowCount } = await query(
      `UPDATE organisations SET status = $1, updated_at = now() WHERE id = $2`,
      [status, id]
    );

    if (rowCount === 0) {
      return sendErr(res, req, 404, "Organisation not found");
    }

    // Revoke all sessions for users in that organisation so old JWTs never "come back"
// Revoke all sessions for users in that organisation so old JWTs never "come back"
await query(
  `
  UPDATE users
  SET session_revoked_at = now(),
      updated_at = now()
  WHERE organisation_id = $1
    AND role <> 'OWNER'
  `,
  [id]
);

// Audit the revocation explicitly UNDER the TARGET ORG
await auditEvent(req, "USER_SESSIONS_REVOKED", {
  organisationId: id,                 // ✅ target organisation
  actorUserId: req.user.id,
  actorRole: req.user.role,
  targetType: "organisation",
  targetId: String(id),
  meta: { reason: "ORG_STATUS_CHANGED", status },
});

// Audit the status change UNDER the TARGET ORG
await auditEvent(req, status === "SUSPENDED" ? "PROVIDER_SUSPENDED" : "PROVIDER_ACTIVATED", {
  organisationId: id,                 // ✅ target organisation
  actorUserId: req.user.id,
  actorRole: req.user.role,
  targetType: "organisation",
  targetId: String(id),
});


    return res.json({ ok: true, id, status });
  } catch (err) {
    console.error(
      "Error in PATCH /api/owner/organisations/:id/status:",
      err
    );
    return sendErr(res, req, 500, "Failed to update organisation status");
  }
});

/**
 * PATCH /api/owner/users/:id/status
 * body: { isActive: boolean }
 * Owner can activate/deactivate ADMIN/WORKER but not OWNER accounts.
 */
router.patch("/users/:id/status", async (req, res) => {
  try {
    
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid user id");
    }

    const parsed = booleanFlagSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid status data");
    }
    const { isActive } = parsed.data;

    const { rows } = await query(
      `SELECT id, role, organisation_id AS "organisationId" FROM users WHERE id = $1`,
      [id]
    );

    const existing = rows[0];

    if (!existing) {
      return sendErr(res, req, 404, "User not found");
    }

    if (existing.role === "OWNER") {
      return sendErr(res, req, 400, "You cannot change status of OWNER accounts");
    }

    await query(
      `UPDATE users
      SET is_active = $1,
          session_revoked_at = now(),
          updated_at = now()
      WHERE id = $2`,
      [isActive, id]
    );


    await auditEvent(req, isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED", {
      organisationId: existing.organisationId,  // ✅ user's organisation
      actorUserId: req.user.id,
      actorRole: req.user.role,
      targetType: "user",
      targetId: String(id),
      meta: { role: existing.role },
    });


    return res.json({ ok: true, id, isActive: !!isActive });
  } catch (err) {
    console.error("Error in PATCH /api/owner/users/:id/status:", err);
    return sendErr(res, req, 500, "Failed to update user status");
  }
});

module.exports = router;
