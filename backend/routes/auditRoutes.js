// backend/routes/auditRoutes.js
const express = require("express");
const { z } = require("zod");
const { requireAuth, requireRole } = require("../authMiddleware");
const { query } = require("../dbAdapter");

const router = express.Router();

const auditSearchSchema = z.object({
  organisationId: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : Number(v)),
    z.number().int().positive().optional()
  ),
  action: z.string().trim().max(100).optional(),
  targetType: z.string().trim().max(100).optional(),
  cursor: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : Number(v)),
    z.number().int().positive().optional()
  ),
  limit: z.preprocess(
    (v) => (v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(500).optional()
  ),
});

router.post(
  "/search",
  requireAuth,
  requireRole("ADMIN", "OWNER"),
  async (req, res) => {
    try {
      const parsed = auditSearchSchema.safeParse(req.body || {});
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join("; ");
        return res.status(400).json({ error: msg || "Invalid search body", requestId: req.id });
      }

      const body = parsed.data;
      const limit = body.limit ?? 200;

      // ✅ org scoping
      let orgId = req.user.organisationId;

      if (req.user.role === "OWNER") {
        if (!body.organisationId) {
          return res.status(400).json({
            error: "organisationId is required for OWNER audit search.",
            requestId: req.id,
          });
        }
        orgId = body.organisationId;
      }

      const where = [`organisation_id = $1`];
      const params = [orgId];
      let i = 2;

      if (body.action) {
        where.push(`action = $${i++}`);
        params.push(body.action);
      }

      if (body.targetType) {
        where.push(`target_type = $${i++}`);
        params.push(body.targetType);
      }

      if (body.cursor) {
        where.push(`id < $${i++}`);
        params.push(body.cursor);
      }

      // ✅ parameterised LIMIT
      const limitParam = `$${i++}`;
      params.push(limit);

      const { rows } = await query(
        `
        SELECT id,
               occurred_at AS "occurredAt",
               actor_user_id AS "actorUserId",
               actor_role AS "actorRole",
               action,
               target_type AS "targetType",
               target_id AS "targetId",
               meta,
               ip,
               user_agent AS "userAgent",
               request_id AS "requestId",
               path
        FROM audit_events
        WHERE ${where.join(" AND ")}
        ORDER BY id DESC
        LIMIT ${limitParam}
        `,
        params
      );

      const nextCursor = rows.length ? String(rows[rows.length - 1].id) : null;
      return res.json({ events: rows, nextCursor });
    } catch (e) {
      console.error(`[${req.id}] audit search error:`, e);
      return res.status(500).json({ error: "Failed to search audit log", requestId: req.id });
    }
  }
);

module.exports = router;
