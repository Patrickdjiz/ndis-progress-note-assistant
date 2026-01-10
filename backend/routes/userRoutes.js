// routes/userRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { requireAuth, requireRole } = require("../authMiddleware");
const {
  createWorkerSchema,
  booleanFlagSchema,
} = require("../validation");
const {
  findUserByEmail,
  getOrgUsersForAdmin,
  createWorkerUser,
  findUserByIdInOrg,
  updateUserActiveFlag,
} = require("../dbAdapter");

const sendErr = (res, req, status, msg) =>
  res.status(status).json({ error: msg, requestId: req.id });

const router = express.Router();

// All user routes require auth + ADMIN/OWNER
router.use(requireAuth);
router.use(requireRole("ADMIN", "OWNER"));

router.use((req, res, next) => {
  if (req.user?.mustChangePassword) {
    return sendErr(res, req, 403, "You must change your password before continuing.");
  }
  next();
});


/**
 * GET /api/users
 * List team for the current organisation.
 * - ADMIN: sees themselves + all WORKERs in their org
 * - OWNER: we generally won't use this route (owner uses /api/owner/overview)
 */
router.get("/", async (req, res) => {
  try {
    const users = await getOrgUsersForAdmin(
      req.user.organisationId,
      req.user.id
    );
    return res.json({ users });
  } catch (err) {
    console.error("Error listing users:", err.message);
    return sendErr(res, req, 500, "Failed to list users");
  }
});

/**
 * POST /api/users
 * Create a new WORKER in the current organisation.
 * Provider admins CANNOT create other admins from here.
 */
router.post("/", async (req, res) => {
  try {
    // ✅ Validate body with Zod schema
    const parsed = createWorkerSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid user data");
    }

    const { email, fullName, password } = parsed.data;
    const normalisedEmail = email.trim().toLowerCase();

    // Check uniqueness across DB
    const existing = await findUserByEmail(normalisedEmail);
    if (existing) {
      return res
        .status(400)
        .json({ error: "A user with this email already exists" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await createWorkerUser({
      orgId: req.user.organisationId,
      email: normalisedEmail,
      fullName: fullName.trim(),
      passwordHash: hash,
    });

    return res.status(201).json({ user });
  } catch (err) {
    console.error("Error creating user:", err.message);
    return sendErr(res, req, 500, "Failed to create user");
  }
});

/**
 * PATCH /api/users/:id/status
 * Toggle active / inactive for WORKERs only.
 */
router.patch("/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid user id");
    }

    // ✅ Validate body
    const parsed = booleanFlagSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid status data");
    }

    const { isActive } = parsed.data;

    // Can't change your own status
    if (id === req.user.id) {
      return res
        .status(400)
        .json({ error: "You cannot change your own status" });
    }

    // Ensure user is in same org AND is a WORKER
    const existing = await findUserByIdInOrg(
      id,
      req.user.organisationId
    );

    if (!existing) {
      return sendErr(res, req, 404, "User not found");
    }
    if (existing.role !== "WORKER") {
      return sendErr(res, req, 400, "You can only change worker accounts from the team screen");
    }

    await updateUserActiveFlag(id, !!isActive);

    return res.json({ ok: true, id, isActive: !!isActive });
  } catch (err) {
    console.error("Error updating user status:", err.message);
    return sendErr(res, req, 500, "Failed to update user status");
  }
});

module.exports = router;
