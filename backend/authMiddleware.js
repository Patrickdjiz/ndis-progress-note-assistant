// backend/authMiddleware.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { JWT_SECRET, PRIVACY_NOTICE_VERSION } = require("./config/env");
const { query } = require("./dbAdapter");


const PRIVACY_CACHE_TTL_MS = 5 * 60 * 1000;
const privacyAcceptanceCache = new Map(); // `${userId}:${version}` -> { ok:true, exp }

function requiredPrivacyVersion() {
  const v = PRIVACY_NOTICE_VERSION;
  return v && String(v).trim() ? String(v).trim() : null;
}

async function hasAcceptedPrivacy(userId, version) {
  const key = `${userId}:${version}`;
  const now = Date.now();

  const hit = privacyAcceptanceCache.get(key);
  if (hit && hit.exp > now) return hit.ok; // will only ever be true with change below

  const { rows } = await query(
    `
    SELECT 1
    FROM privacy_acceptances
    WHERE user_id = $1 AND policy_version = $2
    LIMIT 1
    `,
    [userId, version]
  );

  const ok = !!rows[0];

  // ✅ IMPORTANT: cache only TRUE
  if (ok) {
    privacyAcceptanceCache.set(key, { ok: true, exp: now + PRIVACY_CACHE_TTL_MS });
  } else {
    privacyAcceptanceCache.delete(key); // prevent stale "false" locks
  }

  return ok;
}


function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      orgId: user.organisationId,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: "4h",
      jwtid: crypto.randomUUID(),
    }
  );
}


async function getSessionUserFromDb(userId) {
  const { rows } = await query(
    `
    SELECT
      u.id,
      u.organisation_id AS "organisationId",
      u.email,
      u.role,
      u.full_name AS "fullName",
      u.is_active AS "isActive",
      u.must_change_password AS "mustChangePassword",
      u.password_changed_at AS "passwordChangedAt",
      o.status AS "orgStatus"
    FROM users u
    LEFT JOIN organisations o ON o.id = u.organisation_id
    WHERE u.id = $1
    LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing auth token", requestId: req.id });
  }

  const token = auth.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.error("JWT verify error:", err.message);
    }
    return res
      .status(401)
      .json({ error: "Invalid or expired token", requestId: req.id });
  }

    // ✅ Force numeric user id from token (JWT payloads can be strings)
  const tokenUserId = Number(payload.id);
  if (!Number.isInteger(tokenUserId)) {
    return res.status(401).json({
      error: "Invalid token payload",
      requestId: req.id,
    });
  }

  try {
    const dbUser = await getSessionUserFromDb(tokenUserId);

    if (!dbUser) {
      return res
        .status(401)
        .json({ error: "Invalid or expired token", requestId: req.id });
    }

    // ✅ If account is inactive, treat token as revoked -> 401 so frontend logs out
    if (!dbUser.isActive) {
      return res.status(401).json({
        error: "This user account is inactive. Please contact your provider.",
        code: "ACCOUNT_INACTIVE",
        requestId: req.id,
      });
    }

    // ✅ If org suspended, treat token as revoked -> 401 so frontend logs out
    // (OWNER allowed regardless of org status)
    if (dbUser.role !== "OWNER" && dbUser.orgStatus !== "ACTIVE") {
      return res.status(401).json({
        error:
          "This provider account is suspended. Please contact the platform owner or your organisation.",
        code: "ORG_SUSPENDED",
        requestId: req.id,
      });
    }

    // ✅ Invalidate token if password changed after token was issued
    const tokenIatMs = (payload.iat || 0) * 1000;
    const pwdChangedMs = dbUser.passwordChangedAt
      ? new Date(dbUser.passwordChangedAt).getTime()
      : 0;

    // small slack to avoid edge timing issues
    if (pwdChangedMs && tokenIatMs && tokenIatMs < pwdChangedMs - 1000) {
      return res.status(401).json({
        error: "Session expired. Please log in again.",
        code: "PASSWORD_CHANGED",
        requestId: req.id,
      });
    }

    // DB truth wins
    req.user = {
      id: Number(dbUser.id),
      organisationId: Number(dbUser.organisationId),
      role: dbUser.role,
      fullName: dbUser.fullName,
      email: dbUser.email,
      mustChangePassword: !!dbUser.mustChangePassword,
    };


    // backend/authMiddleware.js (inside requireAuth, after req.user = {...})

    const safePath = (req.originalUrl || req.path || "").split("?")[0];

    // Allow only these paths when mustChangePassword is true
    const allowWhenMustChange = new Set([
      "/api/account/change-password",
      "/api/account/profile",
      "/api/auth/me",
      "/api/health",
      "/api/health/db",

      // ✅ allow privacy consent while must_change_password is true
      "/api/privacy/consent",
      "/api/privacy/latest",
      "/api/privacy/accept",
    ]);

    if (req.user.mustChangePassword && !allowWhenMustChange.has(safePath)) {
      return res.status(403).json({
        error: "You must change your password before continuing.",
        code: "MUST_CHANGE_PASSWORD",
        requestId: req.id,
      });
    }

        // ----- Privacy notice hard gate (428) -----
    const policyVersion = requiredPrivacyVersion();

    if (policyVersion) {
      const accepted = await hasAcceptedPrivacy(req.user.id, policyVersion);
      req.user.mustAcceptPrivacy = !accepted;

      const allowWhenMustAcceptPrivacy = new Set([
        "/api/privacy/latest",
        "/api/privacy/accept",
        "/api/privacy/consent", // backward compatible
        "/api/auth/me",
        "/api/health",
        "/api/health/db",
        "/api/privacy/consent",
      ]);

      if (req.user.mustAcceptPrivacy && !allowWhenMustAcceptPrivacy.has(safePath)) {
        return res.status(428).json({
          error: "Privacy notice acceptance required before continuing.",
          code: "PRIVACY_NOTICE_REQUIRED",
          policyVersion,
          requestId: req.id,
        });
      }
    } else {
      req.user.mustAcceptPrivacy = false;
    }


    next();
  } catch (err) {
    console.error("Auth DB check error:", err.message);
    return res
      .status(500)
      .json({ error: "Authentication failed", requestId: req.id });
  }
}

function requireRole(...allowed) {
  // allow requireRole("ADMIN","OWNER") and requireRole(["ADMIN","OWNER"])
  const allowedRoles = allowed
    .flat()
    .map((r) => String(r || "").trim().toUpperCase())
    .filter(Boolean);

  return (req, res, next) => {
    const role = String(req.user?.role || "").trim().toUpperCase();

    if (!req.user || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Forbidden", requestId: req.id });
    }
    next();
  };
}


module.exports = { generateToken, requireAuth, requireRole };
