// backend/routes/privacyRoutes.js
const express = require("express");
const { requireAuth } = require("../authMiddleware");
const { query } = require("../dbAdapter");
const { audit } = require("../audit"); // ✅ match notesRoutes usage
const { getClientIp } = require("../clientIp");

const router = express.Router();
router.use(requireAuth);

function requiredPolicyVersion() {
  const v = process.env.PRIVACY_NOTICE_VERSION;
  return v && String(v).trim() ? String(v).trim() : null;
}

async function getAcceptedAtForVersion(userId, version) {
  const { rows } = await query(
    `
    SELECT accepted_at
    FROM privacy_acceptances
    WHERE user_id = $1
      AND policy_version = $2
    LIMIT 1
    `,
    [userId, version]
  );
  return rows[0]?.accepted_at || null;
}

function getOrgIdOr400(req, res) {
  const orgId = Number(req.user?.organisationId);

  // Treat null/undefined/0 as invalid (Number(null) === 0)
  if (!Number.isInteger(orgId) || orgId <= 0) {
    res.status(400).json({
      error: "No organisation context for privacy acceptance",
      requestId: req.id,
    });
    return null;
  }

  return orgId;
}


// --------------------
// New-style endpoints
// --------------------

// GET /api/privacy/latest
// GET /api/privacy/latest
router.get("/latest", async (req, res) => {
  try {
    const version = requiredPolicyVersion();

    if (!version) {
      return res.json({
        ok: true,
        required: false,
        policyVersion: null,
        accepted: true,
        acceptedAt: null,
      });
    }

    // ✅ OWNER bypass
    if (req.user.role === "OWNER") {
      return res.json({
        ok: true,
        required: true,
        policyVersion: version,
        accepted: true,
        acceptedAt: null,
      });
    }

    const acceptedAt = await getAcceptedAtForVersion(req.user.id, version);

    return res.json({
      ok: true,
      required: true,
      policyVersion: version,
      accepted: !!acceptedAt,
      acceptedAt,
    });
  } catch (err) {
    console.error(`[${req.id}] Error reading privacy latest:`, err);
    return res.status(500).json({ error: "Failed to load privacy status", requestId: req.id });
  }
});


// POST /api/privacy/accept
router.post("/accept", async (req, res) => {
  try {
    const version = requiredPolicyVersion();
    if (!version) {
      return res.status(500).json({ error: "Privacy notice is not configured", requestId: req.id });
    }

    // ✅ OWNER bypass (no-op)
    if (req.user.role === "OWNER") {
      return res.json({
        ok: true,
        accepted: true,
        policyVersion: version,
        acceptedAt: null,
        alreadyAccepted: true,
      });
    }

    // ✅ Must have org context
    const orgId = getOrgIdOr400(req, res);
    if (!orgId) return;

    const ip = getClientIp(req);
    const ua = (req.get("user-agent") || "").slice(0, 512) || null;

    const ins = await query(
      `
      INSERT INTO privacy_acceptances (organisation_id, user_id, policy_version, ip, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, policy_version)
      DO NOTHING
      RETURNING accepted_at
      `,
      [orgId, req.user.id, version, ip, ua]
    );

    const alreadyAccepted = !ins.rows[0];
    const acceptedAt = alreadyAccepted
      ? await getAcceptedAtForVersion(req.user.id, version)
      : ins.rows[0].accepted_at;

    if (!alreadyAccepted) {
      await audit(req, "PRIVACY_NOTICE_ACCEPTED", {
        targetType: "privacy_notice",
        targetId: version,
        meta: { policyVersion: version },
      });
    }

    return res.json({ ok: true, policyVersion: version, acceptedAt, alreadyAccepted });
  } catch (err) {
    console.error(`[${req.id}] Error accepting privacy notice:`, err);
    return res.status(500).json({ error: "Failed to record acceptance", requestId: req.id });
  }
});


// --------------------
// Back-compat endpoints
// (your frontend may already use these)
// --------------------

// GET /api/privacy/consent
// GET /api/privacy/consent
router.get("/consent", async (req, res) => {
  try {
    const version = requiredPolicyVersion();

    // If not configured, treat as not required (don’t block app)
    if (!version) {
      return res.json({
        accepted: true,
        currentVersion: null,
        acceptedVersion: null,
        acceptedAt: null,
        organisationId: Number(req.user.organisationId),
      });
    }

    // ✅ OWNER bypass (treat as accepted, no org context)
    if (req.user.role === "OWNER") {
      return res.json({
        accepted: true,
        currentVersion: version,
        acceptedVersion: version,
        acceptedAt: null,
        organisationId: null,
      });
    }

    const acceptedAt = await getAcceptedAtForVersion(req.user.id, version);

    return res.json({
      accepted: !!acceptedAt,
      currentVersion: version,
      acceptedVersion: acceptedAt ? version : null,
      acceptedAt: acceptedAt || null,
      organisationId: Number(req.user.organisationId),
    });
  } catch (err) {
    console.error(`[${req.id}] Error reading privacy consent:`, err);
    return res.status(500).json({ error: "Failed to load privacy status", requestId: req.id });
  }
});


// POST /api/privacy/consent  (expects { version } like your current UI)
router.post("/consent", async (req, res) => {
  try {
    const required = requiredPolicyVersion();
    if (!required) {
      return res.status(500).json({ error: "Privacy notice is not configured", requestId: req.id });
    }

    // ✅ OWNER bypass (no-op)
    if (req.user.role === "OWNER") {
      return res.json({
        accepted: true,
        currentVersion: required,
        acceptedVersion: required,
        acceptedAt: null,
        alreadyAccepted: true,
      });
    }

    // ✅ Must have org context
    const orgId = getOrgIdOr400(req, res);
    if (!orgId) return;

    const version = String(req.body?.version || "").trim();
    if (!version) {
      return res.status(400).json({ error: "Missing version", requestId: req.id });
    }
    if (version !== required) {
      return res.status(400).json({
        error: "Version mismatch",
        currentVersion: required,
        requestId: req.id,
      });
    }

    const ip = getClientIp(req);
    const ua = (req.get("user-agent") || "").slice(0, 512) || null;

    const ins = await query(
      `
      INSERT INTO privacy_acceptances (organisation_id, user_id, policy_version, ip, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, policy_version)
      DO NOTHING
      RETURNING accepted_at
      `,
      [orgId, req.user.id, version, ip, ua]
    );

    const alreadyAccepted = !ins.rows[0];
    const acceptedAt = alreadyAccepted
      ? await getAcceptedAtForVersion(req.user.id, version)
      : ins.rows[0].accepted_at;

    if (!alreadyAccepted) {
      await audit(req, "PRIVACY_NOTICE_ACCEPTED", {
        targetType: "privacy_notice",
        targetId: version,
        meta: { policyVersion: version },
      });
    }

    return res.json({
      accepted: true,
      currentVersion: required,
      acceptedVersion: version,
      acceptedAt,
      alreadyAccepted,
    });
  } catch (err) {
    console.error(`[${req.id}] Error saving privacy consent:`, err);
    return res.status(500).json({ error: "Failed to record acceptance", requestId: req.id });
  }
});


module.exports = router;
