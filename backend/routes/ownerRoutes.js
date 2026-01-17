// routes/ownerRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { requireAuth, requireRole } = require("../authMiddleware");
const {
  createProviderSchema,
  booleanFlagSchema,
  orgStatusSchema,
} = require("../validation");
const { query } = require("../dbAdapter");
const { pool } = require("../pgClient");
const { audit } = require("../audit");

const router = express.Router();

const sendErr = (res, req, status, msg) =>
  res.status(status).json({ error: msg, requestId: req.id });


// All routes here: must be logged in + OWNER
router.use(requireAuth);
router.use(requireRole("OWNER"));

router.use((req, res, next) => {
  if (req.user?.mustChangePassword) {
    return sendErr(res, req, 403, "You must change your password before continuing.");  
  }
  next();
});


/**
 * GET /api/owner/overview
 * Returns all organisations + their users (admins + workers)
 */
router.get("/overview", async (req, res) => {
  try {
    const { rows: orgs } = await query(
      `
      SELECT
        id,
        name,
        status,
        created_at AS "createdAt"
      FROM organisations
      ORDER BY created_at DESC
    `
    );

    const results = [];
    for (const org of orgs) {
      const { rows: users } = await query(
        `
        SELECT
          id,
          email,
          full_name AS "fullName",
          role,
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE organisation_id = $1
        ORDER BY role DESC, created_at DESC
      `,
        [org.id]
      );

      results.push({
        ...org,
        users,
      });
    }

    return res.json({ organisations: results });
  } catch (err) {
    console.error("Error in /api/owner/overview:", err);
    return sendErr(res, req, 500, "Failed to load overview");
  }
});

/**
 * POST /api/owner/providers
 * body: { organisationName, adminEmail, adminFullName, adminPassword }
 * Creates an organisation + ADMIN user (transactional)
 */
router.post("/providers", async (req, res) => {
  try {
    // ✅ Validate body with Zod
    const parsed = createProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid provider data");
    }

    const {
      organisationName,
      adminEmail,
      adminFullName,
      adminPassword,
    } = parsed.data;

    const trimmedOrgName = organisationName.trim();
    const normalisedEmail = adminEmail.trim().toLowerCase();
    const trimmedFullName = adminFullName.trim();
    const password = adminPassword.trim();
    const nowIso = new Date().toISOString();

    const hash = await bcrypt.hash(password, 10);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Existing user with same email?
      const existingUser = await client.query(
        `SELECT id FROM users WHERE lower(email) = lower($1)`,
        [normalisedEmail]
      );
      if (existingUser.rows.length > 0) {
        await client.query("ROLLBACK");
        return sendErr(res, req, 400, "A user with this email already exists");
      }

      // Existing org with same name?
      const existingOrg = await client.query(
        `SELECT id FROM organisations WHERE name = $1`,
        [trimmedOrgName]
      );
      if (existingOrg.rows.length > 0) {
        await client.query("ROLLBACK");
        return sendErr(res, req, 400, "An organisation with this name already exists");
      }

      // 1) Create org
      const orgRes = await client.query(
        `
        INSERT INTO organisations (name, status, created_at)
        VALUES ($1, 'ACTIVE', $2)
        RETURNING id, name, status, created_at AS "createdAt"
      `,
        [trimmedOrgName, nowIso]
      );
      const organisation = orgRes.rows[0];

      // 2) Create admin user  ✅ force change password on first login
    const adminRes = await client.query(
      `
      INSERT INTO users (
      organisation_id,
      email,
      password_hash,
      role,
      full_name,
      is_active,
      must_change_password,
      created_at
    )
    VALUES ($1, $2, $3, 'ADMIN', $4, TRUE, TRUE, $5)
      RETURNING
        id,
        organisation_id AS "organisationId",
        email,
        full_name AS "fullName",
        role,
        is_active AS "isActive",
        must_change_password AS "mustChangePassword",
        created_at AS "createdAt"
    `,
      [organisation.id, normalisedEmail, hash, trimmedFullName, nowIso]
    );
    const admin = adminRes.rows[0];


      await client.query("COMMIT");

      await audit(req, "PROVIDER_CREATED", {
      targetType: "organisation",
      targetId: String(organisation.id),
      meta: { organisationName: organisation.name, adminUserId: admin.id },
    });


      return res.status(201).json({ organisation, admin });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error creating provider:", err);
      return sendErr(res, req, 500, "Failed to create provider");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error in POST /api/owner/providers:", err);
    return sendErr(res, req, 500, "Failed to create provider");
  }
});

/**
 * PATCH /api/owner/organisations/:id/status
 * body: { status: 'ACTIVE' | 'SUSPENDED' }
 */
router.patch("/organisations/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid organisation id");
    }

    const parsed = orgStatusSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid status data");
    }
    const { status } = parsed.data;

    const { rowCount } = await query(
      `UPDATE organisations SET status = $1, updated_at = now() WHERE id = $2`,
      [status, id]
    );

    if (rowCount === 0) {
      return sendErr(res, req, 404, "Organisation not found");
    }

    await audit(req, status === "SUSPENDED" ? "PROVIDER_SUSPENDED" : "PROVIDER_ACTIVATED", {
      targetType: "organisation",
      targetId: String(id),
    });

    return res.json({ ok: true, id, status });
  } catch (err) {
    console.error(
      "Error in PATCH /api/owner/organisations/:id/status:",
      err
    );
    return sendErr(res, req, 500, "Failed to update organisation status");
  }
});

/**
 * PATCH /api/owner/users/:id/status
 * body: { isActive: boolean }
 * Owner can activate/deactivate ADMIN/WORKER but not OWNER accounts.
 */
router.patch("/users/:id/status", async (req, res) => {
  try {
    
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid user id");
    }

    const parsed = booleanFlagSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid status data");
    }
    const { isActive } = parsed.data;

    const { rows } = await query(
      `SELECT id, role FROM users WHERE id = $1`,
      [id]
    );
    const existing = rows[0];

    if (!existing) {
      return sendErr(res, req, 404, "User not found");
    }

    if (existing.role === "OWNER") {
      return sendErr(res, req, 400, "You cannot change status of OWNER accounts");
    }

    await query(`UPDATE users SET is_active = $1, updated_at = now() WHERE id = $2`, [
      isActive,
      id,
    ]);


    await audit(req, isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED", {
      targetType: "user",
      targetId: String(id),
    });

    return res.json({ ok: true, id, isActive: !!isActive });
  } catch (err) {
    console.error("Error in PATCH /api/owner/users/:id/status:", err);
    return sendErr(res, req, 500, "Failed to update user status");
  }
});

module.exports = router;
