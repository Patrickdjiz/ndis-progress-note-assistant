// backend/routes/auditRoutes.js
const express = require("express");
const { requireAuth, requireRole } = require("../authMiddleware");
const { query } = require("../dbAdapter");
const { z } = require("zod");

const router = express.Router();

// Body validation (keeps this endpoint tight + predictable)
const auditSearchSchema = z.object({
  limit: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(1).max(500)).optional(),
  cursor: z.preprocess((v) => (v === undefined || v === null || v === "" ? undefined : Number(v)), z.number().int().positive()).optional(),

  action: z.string().trim().max(120).optional(),
  targetType: z.string().trim().max(120).optional(),
  targetId: z.string().trim().max(200).optional(),
  actorRole: z.string().trim().max(50).optional(),
  actorUserId: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().positive()).optional(),
});

// cursor pagination by id descending
router.post(
  "/search",
  requireAuth,
  requireRole("ADMIN", "OWNER"),
  async (req, res) => {
    try {
      const parsed = auditSearchSchema.safeParse(req.body || {});
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join("; ");
        return res.status(400).json({ error: msg || "Invalid search body" });
      }

      const orgId = req.user.organisationId;
      const limit = parsed.data.limit ?? 200;
      const cursor = parsed.data.cursor ?? null;

      const where = [`organisation_id = $1`];
      const params = [orgId];
      let i = 2;

      if (parsed.data.action) {
        where.push(`action = $${i++}`);
        params.push(parsed.data.action);
      }

      if (parsed.data.targetType) {
        where.push(`target_type = $${i++}`);
        params.push(parsed.data.targetType);
      }

      if (parsed.data.targetId) {
        where.push(`target_id = $${i++}`);
        params.push(parsed.data.targetId);
      }

      if (parsed.data.actorRole) {
        where.push(`actor_role = $${i++}`);
        params.push(parsed.data.actorRole);
      }

      if (parsed.data.actorUserId) {
        where.push(`actor_user_id = $${i++}`);
        params.push(parsed.data.actorUserId);
      }

      if (cursor) {
        where.push(`id < $${i++}`);
        params.push(cursor);
      }

      // NOTE: column names here assume your audit table uses:
      // occurred_at, actor_user_id, actor_role, user_agent, request_id, etc.
      // If yours differ, adjust the SELECT aliases.
      const { rows } = await query(
        `
        SELECT
          id,
          occurred_at   AS "occurredAt",
          actor_user_id AS "actorUserId",
          actor_role    AS "actorRole",
          action,
          target_type   AS "targetType",
          target_id     AS "targetId",
          meta,
          ip,
          user_agent    AS "userAgent",
          request_id    AS "requestId",
          path
        FROM audit_events
        WHERE ${where.join(" AND ")}
        ORDER BY id DESC
        LIMIT ${limit}
        `,
        params
      );

      const nextCursor = rows.length ? String(rows[rows.length - 1].id) : null;
      return res.json({ events: rows, nextCursor });
    } catch (err) {
      console.error("Error searching audit log:", err);
      return res.status(500).json({ error: "Failed to search audit log" });
    }
  }
);

module.exports = router;
