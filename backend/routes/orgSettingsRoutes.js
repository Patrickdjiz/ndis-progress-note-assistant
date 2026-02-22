// backend/routes/orgSettingsRoutes.js
const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../authMiddleware");
const { query } = require("../dbAdapter");
const { audit } = require("../audit"); // <- match your notesRoutes usage

const router = express.Router();
router.use(requireAuth);

const updateSchema = z
  .object({
    retentionDays: z.coerce.number().int().min(30).max(36500).optional(),
    deleteGraceDays: z.coerce.number().int().min(1).max(365).optional(),

    // OWNER only (optional support)
    organisationId: z.coerce.number().int().positive().optional(),

    autoPurgeEnabled: z.coerce.boolean().optional(),
    aiEnabled: z.coerce.boolean().optional(),
  })
  .refine(
    (v) =>
      v.retentionDays !== undefined ||
      v.deleteGraceDays !== undefined ||
      v.autoPurgeEnabled !== undefined ||
      v.aiEnabled !== undefined,
    { message: "Provide at least one setting to update." }
  );

// GET /api/org/settings
router.get("/settings", async (req, res) => {
  try {
    if (!["ADMIN", "OWNER"].includes(req.user.role)) {
      return res.status(403).json({ error: "Not allowed", requestId: req.id });
    }

    const organisationId = req.query.organisationId; // OWNER can pass this

    let orgId = Number(req.user.organisationId);

    if (req.user.role === "OWNER") {
      if (!organisationId) {
        return res.status(400).json({ error: "organisationId is required for OWNER", requestId: req.id });
      }
      orgId = Number(organisationId);
    }

    if (!Number.isInteger(orgId) || orgId <= 0) {
      return res.status(400).json({ error: "Invalid organisationId", requestId: req.id });
    }

    const { rows } = await query(
      `
      SELECT id, name,
             retention_days AS "retentionDays",
             delete_grace_days AS "deleteGraceDays",
             auto_purge_enabled AS "autoPurgeEnabled",
             ai_enabled AS "aiEnabled"
      FROM organisations
      WHERE id = $1
      LIMIT 1
      `,
      [orgId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Organisation not found", requestId: req.id });
    }

    await audit(req, "ORG_SETTINGS_VIEWED", {
      targetType: "organisation",
      targetId: String(orgId),
    });

    return res.json({ ok: true, settings: rows[0] });
  } catch (err) {
    console.error(`[${req.id}] Error reading org settings:`, err);
    return res.status(500).json({ error: "Failed to read org settings", requestId: req.id });
  }
});

// POST /api/org/settings
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

    const organisationId = parsed.data.organisationId; // OWNER only
    let orgId = Number(req.user.organisationId);

    if (req.user.role === "OWNER") {
      if (!organisationId) {
        return res.status(400).json({ error: "organisationId is required for OWNER", requestId: req.id });
      }
      orgId = Number(organisationId);
    } else {
      // ADMIN cannot set orgId
      if (organisationId !== undefined) {
        return res.status(400).json({ error: "Admins cannot update other organisations", requestId: req.id });
      }
    }

    if (!Number.isInteger(orgId) || orgId <= 0) {
      return res.status(400).json({ error: "Invalid organisationId", requestId: req.id });
    }

    // Load before
    const { rows: beforeRows } = await query(
      `
      SELECT retention_days AS "retentionDays",
             delete_grace_days AS "deleteGraceDays",
             auto_purge_enabled AS "autoPurgeEnabled",
             ai_enabled AS "aiEnabled"
      FROM organisations
      WHERE id = $1
      LIMIT 1
      `,
      [orgId]
    );

    const before = beforeRows[0];
    if (!before) {
      return res.status(404).json({ error: "Organisation not found", requestId: req.id });
    }

    const after = {
      retentionDays: parsed.data.retentionDays ?? before.retentionDays,
      deleteGraceDays: parsed.data.deleteGraceDays ?? before.deleteGraceDays,
      autoPurgeEnabled: parsed.data.autoPurgeEnabled ?? before.autoPurgeEnabled,
      aiEnabled: parsed.data.aiEnabled ?? before.aiEnabled,
    };

    const { rows } = await query(
      `
      UPDATE organisations
      SET retention_days = $1,
          delete_grace_days = $2,
          auto_purge_enabled = $3,
          ai_enabled = $4,
          updated_at = now()
      WHERE id = $5
      RETURNING retention_days AS "retentionDays",
                delete_grace_days AS "deleteGraceDays",
                auto_purge_enabled AS "autoPurgeEnabled",
                ai_enabled AS "aiEnabled"
      `,
      [after.retentionDays, after.deleteGraceDays, after.autoPurgeEnabled, after.aiEnabled, orgId]
    );

    await audit(req, "ORG_SETTINGS_UPDATED", {
      targetType: "organisation",
      targetId: String(orgId),
      meta: { before, after },
    });

    return res.json({ ok: true, settings: rows[0] });
  } catch (err) {
    console.error(`[${req.id}] Error updating org settings:`, err);
    return res.status(500).json({ error: "Failed to update org settings", requestId: req.id });
  }
});

module.exports = router;
