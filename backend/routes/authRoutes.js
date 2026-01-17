// routes/authRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { generateToken, requireAuth } = require("../authMiddleware");
const {
  findUserByEmailWithOrg,
} = require("../dbAdapter");
const {
  loginSchema,
} = require("../validation");
const crypto = require("crypto");
const { auditEvent } = require("../audit");


const sendErr = (res, req, status, msg) =>
  res.status(status).json({ error: msg, requestId: req.id });

const router = express.Router();

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s || "")).digest("hex");
}

// POST /api/login
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid login data");
    }

    const { email, password } = parsed.data;
    const normalisedEmail = email.trim().toLowerCase();
    const emailHash = sha256Hex(normalisedEmail);

    // Fetch user
    const row = await findUserByEmailWithOrg(normalisedEmail);

    // Not found -> audit (hashed) + generic error
    if (!row) {
      await auditEvent(req, "LOGIN_FAILED", {
        actorRole: "ANON",
        targetType: "auth",
        targetId: null,
        meta: { emailHash, reason: "invalid_credentials" },
      });
      return sendErr(res, req, 401, "Invalid email or password");
    }

    // Inactive -> audit + block
    if (!row.isActive) {
      await auditEvent(req, "LOGIN_BLOCKED", {
        organisationId: row.organisationId ?? null,
        actorUserId: row.id,
        actorRole: row.role,
        targetType: "user",
        targetId: String(row.id),
        meta: { reason: "user_inactive" },
      });
      return sendErr(res, req, 403, "This user account is inactive.");
    }

    // Suspended org -> audit + block (OWNER allowed)
    if (row.role !== "OWNER" && row.orgStatus !== "ACTIVE") {
      await auditEvent(req, "LOGIN_BLOCKED", {
        organisationId: row.organisationId ?? null,
        actorUserId: row.id,
        actorRole: row.role,
        targetType: "organisation",
        targetId: String(row.organisationId),
        meta: { reason: "org_suspended" },
      });
      return sendErr(res, req, 403, "This provider account is suspended.");
    }

    // Password verify
    const ok = await bcrypt.compare(String(password), row.passwordHash);
    if (!ok) {
      await auditEvent(req, "LOGIN_FAILED", {
        organisationId: row.organisationId ?? null,
        actorUserId: row.id,
        actorRole: row.role,
        targetType: "auth",
        targetId: String(row.id),
        meta: { reason: "invalid_credentials" },
      });
      return sendErr(res, req, 401, "Invalid email or password");
    }

    // Success audit
    await auditEvent(req, "LOGIN_SUCCESS", {
      organisationId: row.organisationId ?? null,
      actorUserId: row.id,
      actorRole: row.role,
      targetType: "user",
      targetId: String(row.id),
      meta: { mustChangePassword: !!row.mustChangePassword },
    });

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
    return sendErr(res, req, 500, "Login failed");
  }
});


// GET /api/auth/me
router.get("/auth/me", requireAuth, (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      fullName: req.user.fullName,
      role: req.user.role,
      email: req.user.email,
      organisationId: req.user.organisationId,
      mustChangePassword: !!req.user.mustChangePassword, // ✅ add this
    },
  });
});


module.exports = router;
