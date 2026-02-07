// routes/authRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { generateToken, requireAuth } = require("../authMiddleware");
const { findUserByEmailWithOrg } = require("../dbAdapter");
const { loginSchema } = require("../validation");
const { auditEvent } = require("../audit");
const { rateLimit, makeStore, limiterHandler, ipKeyGenerator } = require("../rateLimit");
const { findUserByEmailWithOrg, query } = require("../dbAdapter");
const { PRIVACY_NOTICE_VERSION } = require("../config/env");


const sendErr = (res, req, status, msg) =>
  res.status(status).json({ error: msg, requestId: req.id });

const router = express.Router();

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s || "")).digest("hex");
}

function requiredPrivacyVersion() {
  const v = PRIVACY_NOTICE_VERSION ?? process.env.PRIVACY_NOTICE_VERSION;
  return v && String(v).trim() ? String(v).trim() : null;
}

async function hasAcceptedPrivacy(userId, version) {
  const { rows } = await query(
    `
    SELECT 1
    FROM privacy_acceptances
    WHERE user_id = $1 AND policy_version = $2
    LIMIT 1
    `,
    [userId, version]
  );
  return !!rows[0];
}


// ----- rate limiters -----
const ipKey = (req, res) => ipKeyGenerator(req, res);

const emailKey = (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return ipKey(req, res);
  return `e:${sha256Hex(email)}`;
};

const loginIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:auth:login:ip:"),
  keyGenerator: ipKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many login attempts from this network. Please slow down." },
});

const loginEmailLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:auth:login:email:"),
  keyGenerator: emailKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many login attempts for this account. Please wait and try again." },
});

// POST /api/login
router.post("/login", loginIpLimiter, loginEmailLimiter, async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid login data");
    }

    const { email, password } = parsed.data;
    const normalisedEmail = email.trim().toLowerCase();
    const emailHash = sha256Hex(normalisedEmail);

    const row = await findUserByEmailWithOrg(normalisedEmail);

    // Not found
    if (!row) {
      await auditEvent(req, "LOGIN_FAILED", {
        actorRole: "ANON",
        targetType: "auth",
        targetId: null,
        meta: { emailHash, reason: "invalid_credentials" },
      });
      return sendErr(res, req, 401, "Invalid email or password");
    }

    // Inactive user
    if (!row.isActive) {
      await auditEvent(req, "LOGIN_BLOCKED", {
        organisationId: row.organisationId ?? null,
        actorRole: "ANON",
        targetType: "user",
        targetId: String(row.id),
        meta: { emailHash, reason: "user_inactive" },
      });
      return sendErr(res, req, 403, "This user account is inactive.");
    }

    // Suspended org (OWNER bypass if you keep that rule)
    if (row.role !== "OWNER" && row.orgStatus !== "ACTIVE") {
      await auditEvent(req, "LOGIN_BLOCKED", {
        organisationId: row.organisationId ?? null,
        actorRole: "ANON",
        targetType: "organisation",
        targetId: String(row.organisationId),
        meta: { emailHash, reason: "org_suspended" },
      });
      return sendErr(res, req, 403, "This provider account is suspended.");
    }

    // Password verify
    const ok = await bcrypt.compare(String(password), row.passwordHash);
    if (!ok) {
      await auditEvent(req, "LOGIN_FAILED", {
        organisationId: row.organisationId ?? null,
        actorRole: "ANON",
        targetType: "user",
        targetId: String(row.id),
        meta: { reason: "invalid_credentials" },
      });
      return sendErr(res, req, 401, "Invalid email or password");
    }

    // Success (now we *do* know actor)
    await auditEvent(req, "LOGIN_SUCCESS", {
      organisationId: row.organisationId ?? null,
      actorUserId: row.id,
      actorRole: row.role,
      targetType: "user",
      targetId: String(row.id),
      meta: { mustChangePassword: !!row.mustChangePassword },
    });

    const token = generateToken(row);

    const privacyPolicyVersion = requiredPrivacyVersion();
let mustAcceptPrivacy = false;

if (privacyPolicyVersion) {
  const accepted = await hasAcceptedPrivacy(row.id, privacyPolicyVersion);
  mustAcceptPrivacy = !accepted;
}


    return res.json({
  token,
  user: {
    id: row.id,
    email: row.email,
    role: row.role,
    fullName: row.fullName,
    organisationId: row.organisationId,
    mustChangePassword: !!row.mustChangePassword,

    // ✅ add these
    mustAcceptPrivacy,
    privacyPolicyVersion,
  },
});

  } catch (err) {
    console.error("Login error:", err);
    return sendErr(res, req, 500, "Login failed");
  }
});

// GET /api/auth/me
router.get("/auth/me", requireAuth, (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const privacyPolicyVersion =
    (process.env.PRIVACY_NOTICE_VERSION && String(process.env.PRIVACY_NOTICE_VERSION).trim())
      ? String(process.env.PRIVACY_NOTICE_VERSION).trim()
      : null;

  return res.json({
    user: {
      id: req.user.id,
      fullName: req.user.fullName,
      role: req.user.role,
      email: req.user.email,
      organisationId: req.user.organisationId,
      mustChangePassword: !!req.user.mustChangePassword,

      // ✅ add these
      mustAcceptPrivacy: !!req.user.mustAcceptPrivacy,
      privacyPolicyVersion,
    },
  });
});


module.exports = router;
