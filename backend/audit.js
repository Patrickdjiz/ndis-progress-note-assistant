// backend/audit.js
const { query } = require("./dbAdapter");

async function audit(req, action, { targetType = null, targetId = null, meta = null } = {}) {
  try {
    const orgId = req.user?.organisationId ?? null;
    const actorUserId = req.user?.id ?? null;
    const actorRole = req.user?.role ?? null;

    const ip = req.ip || null;
    const userAgent = req.get("user-agent") || null;

    await query(
      `
      INSERT INTO audit_events (
        organisation_id,
        actor_user_id,
        actor_role,
        action,
        target_type,
        target_id,
        meta,
        ip,
        user_agent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [orgId, actorUserId, actorRole, action, targetType, targetId, meta, ip, userAgent]
    );
  } catch (err) {
    // Never block primary request if audit insert fails
    if (process.env.NODE_ENV !== "test") {
      console.error("Audit log failed:", err.message);
    }
  }
}

module.exports = { audit };
