// backend/audit.js
const { query } = require("./dbAdapter");
const { getClientIp } = require("./clientIp");

const MAX_META_BYTES = 10_000;

function safeMeta(meta) {
  if (meta === null || meta === undefined) return null;

  try {
    // Ensure we never store massive blobs
    const json = JSON.stringify(meta);
    if (Buffer.byteLength(json, "utf8") > MAX_META_BYTES) {
      return { truncated: true };
    }
    return meta; // node-postgres will serialize objects into json/jsonb correctly
  } catch {
    return { meta_unserializable: true };
  }
}

// Generic audit writer that does NOT rely on req.user
async function auditEvent(req, action, payload = {}) {
  try {
    const {
      organisationId = null,
      actorUserId = null,
      actorRole = null,
      targetType = null,
      targetId = null,
      meta = null,
    } = payload;

    const ip = getClientIp(req);
    const userAgent = req.get("user-agent") || null;

    const requestId = req.id || null;
    const path = (req.originalUrl || req.path || "").split("?")[0] || null;

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
        user_agent,
        request_id,
        path
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        organisationId,
        actorUserId,
        actorRole,
        action,
        targetType,
        targetId,
        safeMeta(meta),
        ip,
        userAgent,
        requestId,
        path,
      ]
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.error("Audit log failed:", err.message);
    }
  }
}

// Backwards-compatible helper (uses req.user)
async function audit(req, action, { targetType = null, targetId = null, meta = null } = {}) {
  return auditEvent(req, action, {
    organisationId: req.user?.organisationId ?? null,
    actorUserId: req.user?.id ?? null,
    actorRole: req.user?.role ?? null,
    targetType,
    targetId,
    meta,
  });
}

module.exports = { audit, auditEvent };
