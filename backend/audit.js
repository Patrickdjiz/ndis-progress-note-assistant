1// backend/audit.js
const { query } = require("./dbAdapter");
const { getClientIp } = require("./clientIp");

const MAX_META_BYTES = 10_000;

function safeMeta(meta) {
  if (meta === null || meta === undefined) return null;

  // Ensure meta is always a JSON-friendly object/array (avoid jsonb cast issues)
  let normalised = meta;

  if (meta instanceof Date) {
    normalised = { value: meta.toISOString() };
  } else if (typeof meta !== "object") {
    normalised = { value: meta };
  }

  try {
    const json = JSON.stringify(normalised);
    const bytes = Buffer.byteLength(json, "utf8");

    if (bytes > MAX_META_BYTES) {
      return { truncated: true, originalBytes: bytes };
    }
    return normalised;
  } catch {
    return { meta_unserializable: true };
  }
}

// Generic audit writer. req is OPTIONAL (useful for cron/jobs).
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

    const ip = req ? getClientIp(req) : null;
    const userAgent = req?.get ? (req.get("user-agent") || null) : null;

    const requestId = req?.id || null;
    const path = req
      ? ((req.originalUrl || req.path || "").split("?")[0] || null)
      : null;

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
    organisationId: req?.user?.organisationId ?? null,
    actorUserId: req?.user?.id ?? null,
    actorRole: req?.user?.role ?? null,
    targetType,
    targetId,
    meta,
  });
}

module.exports = { audit, auditEvent };
