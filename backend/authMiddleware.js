// backend/authMiddleware.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { JWT_SECRET } = require("./config/env");
const { query } = require("./dbAdapter");

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      orgId: user.organisationId,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
    },
    JWT_SECRET,
    {
      expiresIn: "4h",
      jwtid: crypto.randomUUID(),
      // issuer: "ndisnotes-api",
      // audience: "ndisnotes-web",
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
    return res.status(401).json({ error: "Missing auth token" });
  }

  const token = auth.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.error("JWT verify error:", err.message);
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const dbUser = await getSessionUserFromDb(payload.id);

    if (!dbUser) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // ✅ If account is inactive, treat token as revoked -> 401 so frontend logs out
    if (!dbUser.isActive) {
      return res.status(401).json({
        error: "This user account is inactive. Please contact your provider.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    // ✅ If org suspended, treat token as revoked -> 401 so frontend logs out
    // (OWNER allowed regardless of org status)
    if (dbUser.role !== "OWNER" && dbUser.orgStatus !== "ACTIVE") {
      return res.status(401).json({
        error:
          "This provider account is suspended. Please contact the platform owner or your organisation.",
        code: "ORG_SUSPENDED",
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
      });
    }

    // DB truth wins
    req.user = {
      id: dbUser.id,
      organisationId: dbUser.organisationId,
      role: dbUser.role,
      fullName: dbUser.fullName,
      email: dbUser.email,
      mustChangePassword: !!dbUser.mustChangePassword,
    };

    next();
  } catch (err) {
    console.error("Auth DB check error:", err.message);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

module.exports = { generateToken, requireAuth, requireRole };
