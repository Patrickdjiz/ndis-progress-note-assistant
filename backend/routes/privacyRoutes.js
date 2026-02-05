// backend/routes/privacyRoutes.js
const express = require("express");
const { requireAuth } = require("../authMiddleware");
const { query } = require("../dbAdapter");
const { auditEvent } = require("../audit");
const { PRIVACY_NOTICE_VERSION } = require("../config/env");
const { getClientIp } = require("../clientIp");

const router = express.Router();

router.get("/consent", requireAuth, async (req, res, next) => {
  try {
    const userId = Number(req.user.id);
    const orgId = Number(req.user.organisationId);

    const { rows } = await query(
      `
      SELECT policy_version AS "policyVersion", accepted_at AS "acceptedAt"
      FROM privacy_acceptances
      WHERE user_id = $1
      ORDER BY accepted_at DESC
      LIMIT 1
      `,
      [userId]
    );

    const latest = rows[0] || null;

    return res.json({
      accepted: (latest?.policyVersion || null) === PRIVACY_NOTICE_VERSION,
      currentVersion: PRIVACY_NOTICE_VERSION,
      acceptedVersion: latest?.policyVersion || null,
      acceptedAt: latest?.acceptedAt || null,
      organisationId: orgId,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/consent", requireAuth, async (req, res, next) => {
  try {
    const userId = Number(req.user.id);
    const orgId = Number(req.user.organisationId);
    const role = req.user.role;

    const version = String(req.body?.version || "").trim();
    if (!version) {
      return res.status(400).json({ error: "Missing version", requestId: req.id });
    }
    if (version !== PRIVACY_NOTICE_VERSION) {
      return res.status(400).json({
        error: "Version mismatch",
        currentVersion: PRIVACY_NOTICE_VERSION,
        requestId: req.id,
      });
    }

    const ip = getClientIp(req);
    const userAgent = req.get("user-agent") || null;

    await query(
      `
      INSERT INTO privacy_acceptances (organisation_id, user_id, policy_version, accepted_at, ip, user_agent)
      VALUES ($1, $2, $3, NOW(), $4, $5)
      ON CONFLICT (user_id, policy_version) DO NOTHING
      `,
      [orgId, userId, version, ip, userAgent]
    );

    await auditEvent(req, "PRIVACY_NOTICE_ACCEPTED", {
      organisationId: orgId,
      actorUserId: userId,
      actorRole: role,
      targetType: "USER",
      targetId: String(userId),
      meta: { version },
    });

    return res.json({
      accepted: true,
      currentVersion: PRIVACY_NOTICE_VERSION,
      acceptedVersion: version,
      acceptedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
