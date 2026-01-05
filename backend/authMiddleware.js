// authMiddleware.js
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./config/env");

// helper for login route
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      orgId: user.organisationId,
      role: user.role,
      fullName: user.fullName,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: "4h" }
  );
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.id,
      organisationId: payload.orgId,
      role: payload.role,
      fullName: payload.fullName,
      email: payload.email
    };
    next();
  } catch (err) {
    // Only log full error in development
    if (process.env.NODE_ENV !== "test") {
      console.error("JWT error:", err.message);
    }
    return res.status(401).json({ error: "Invalid or expired token" });
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

module.exports = {
  generateToken,
  requireAuth,
  requireRole
};
