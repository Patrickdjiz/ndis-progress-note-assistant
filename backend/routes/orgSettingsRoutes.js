// backend/routes/orgSettingsRoutes.js
const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../authMiddleware");
const { query } = require("../dbAdapter");
const { audit } = require("../audit");

const router = express.Router();
router.use(requireAuth);

const updateSchema = z.object({
  retentionDays: z.coerce.number().int().min(30).max(36500).optional(),
deleteGraceDays: z.coerce.number().int().min(1).max(365).optional(),
organisationId: z.coerce.number().int().positive().optional(),
  autoPurgeEnabled: z.boolean().optional(),
}).refine((v) => v.retentionDays !== undefined || v.deleteGraceDays !== undefined || v.autoPurgeEnabled !== undefined, {
  message: "Provide at least one setting to update.",
});

router.get("/settings", async (req, res) => {
  try {
    if (!["ADMIN", "OWNER"].includes(req.user.role)) {
      return res.status(403).json({ error: "Not allowed", requestId: req.id });
    }

    // ADMIN -> own org, OWNER -> can query ?organisationId=
    let orgId = req.user.organisationId;

    if (req.user.role === "OWNER") {
    const q = req.query.organisationId ? Number(req.query.organisationId) : null;
    if (!q || !Number.isInteger(q) || q <= 0) {
        return res.status(400).json({ error: "organisationId is required for OWNER", requestId: req.id });
    }
    orgId = q;
    }

    const { rows } = await query(
      `
      SELECT id, name,
             retention_days AS "retentionDays",
             delete_grace_days AS "deleteGraceDays",
             auto_purge_enabled AS "autoPurgeEnabled"
      FROM organisations
      WHERE id = $1
      LIMIT 1
      `,
      [orgId]
    );

    if (!rows[0]) return res.status(404).json({ error: "Organisation not found", requestId: req.id });

    res.json({ ok: true, settings: rows[0] });
  } catch (err) {
    console.error(`[${req.id}] Error reading org settings:`, err);
    res.status(500).json({ error: "Failed to read org settings", requestId: req.id });
  }
});

router.post("/settings", async (req, res) => {
  try {
    if (!["ADMIN", "OWNER"].includes(req.user.role)) {
      return res.status(403).json({ error: "Not allowed", requestId: req.id });
    }

    const parsed = updateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid body", requestId: req.id });
    }

    const { organisationId, retentionDays, deleteGraceDays, autoPurgeEnabled } = parsed.data;

    // Determine target org
    let orgId = req.user.organisationId;
    if (req.user.role === "OWNER") {
      if (!organisationId) return res.status(400).json({ error: "organisationId is required for OWNER", requestId: req.id });
      orgId = organisationId;
    }

    const { rows: beforeRows } = await query(
      `
      SELECT retention_days AS "retentionDays",
             delete_grace_days AS "deleteGraceDays",
             auto_purge_enabled AS "autoPurgeEnabled"
      FROM organisations
      WHERE id = $1
      LIMIT 1
      `,
      [orgId]
    );
    const before = beforeRows[0];
    if (!before) return res.status(404).json({ error: "Organisation not found", requestId: req.id });

    const after = {
      retentionDays: retentionDays ?? before.retentionDays,
      deleteGraceDays: deleteGraceDays ?? before.deleteGraceDays,
      autoPurgeEnabled: autoPurgeEnabled ?? before.autoPurgeEnabled,
    };

    const { rows } = await query(
      `
      UPDATE organisations
      SET retention_days = $1,
          delete_grace_days = $2,
          auto_purge_enabled = $3,
          updated_at = now()
      WHERE id = $4
      RETURNING retention_days AS "retentionDays",
                delete_grace_days AS "deleteGraceDays",
                auto_purge_enabled AS "autoPurgeEnabled"
      `,
      [after.retentionDays, after.deleteGraceDays, after.autoPurgeEnabled, orgId]
    );

    await audit(req, "ORG_SETTINGS_UPDATED", {
      targetType: "organisation",
      targetId: String(orgId),
      meta: { before, after },
      organisationId: orgId, // allows OWNER overrides too
    });

    res.json({ ok: true, settings: rows[0] });
  } catch (err) {
    console.error(`[${req.id}] Error updating org settings:`, err);
    res.status(500).json({ error: "Failed to update org settings", requestId: req.id });
  }
});

module.exports = router;
