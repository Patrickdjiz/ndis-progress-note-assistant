// routes/ownerRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole } = require("../authMiddleware");

const router = express.Router();

// Only OWNER can access these routes
router.use(requireAuth);
router.use(requireRole("OWNER"));

/**
 * GET /api/owner/overview
 * Returns all organisations + their users
 */
router.get("/overview", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        o.id AS organisationId,
        o.name AS organisationName,
        u.id AS userId,
        u.email,
        u.fullName,
        u.role,
        u.isActive,
        u.createdAt
      FROM organisations o
      JOIN users u ON u.organisationId = o.id
      WHERE u.role IN ('ADMIN','WORKER')
      ORDER BY o.name ASC,
               CASE u.role WHEN 'ADMIN' THEN 0 ELSE 1 END,
               u.createdAt DESC
    `).all();

    // Group by organisation in JS
    const organisations = [];
    const map = new Map();

    for (const r of rows) {
      if (!map.has(r.organisationId)) {
        const org = {
          id: r.organisationId,
          name: r.organisationName,
          users: [],
        };
        organisations.push(org);
        map.set(r.organisationId, org);
      }
      map.get(r.organisationId).users.push({
        id: r.userId,
        email: r.email,
        fullName: r.fullName,
        role: r.role,
        isActive: r.isActive,
        createdAt: r.createdAt,
      });
    }

    res.json({ organisations });
  } catch (err) {
    console.error("Error loading owner overview:", err.message);
    res.status(500).json({ error: "Failed to load overview" });
  }
});

/**
 * POST /api/owner/providers
 * Create a new organisation + its ADMIN user
 * body: { organisationName, adminEmail, adminFullName, adminPassword }
 */
router.post("/providers", (req, res) => {
  try {
    const { organisationName, adminEmail, adminFullName, adminPassword } =
      req.body;

    if (!organisationName || !adminEmail || !adminFullName || !adminPassword) {
      return res.status(400).json({
        error:
          "organisationName, adminEmail, adminFullName and adminPassword are required",
      });
    }

    const normalisedOrg = organisationName.trim();
    const normalisedEmail = adminEmail.trim().toLowerCase();

    // ensure org name unique
    const existingOrg = db
      .prepare(`SELECT id FROM organisations WHERE name = ?`)
      .get(normalisedOrg);
    if (existingOrg) {
      return res.status(400).json({ error: "Organisation name already exists" });
    }

    // ensure email unique
    const existingUser = db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .get(normalisedEmail);
    if (existingUser) {
      return res.status(400).json({ error: "Admin email already in use" });
    }

    const nowIso = new Date().toISOString();
    const hash = bcrypt.hashSync(adminPassword, 10);

    const orgStmt = db.prepare(`
      INSERT INTO organisations (name, status, createdAt)
      VALUES (?, 'ACTIVE', ?)
    `);
    const orgInfo = orgStmt.run(normalisedOrg, nowIso);
    const orgId = orgInfo.lastInsertRowid;

    const userStmt = db.prepare(`
      INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
      VALUES (?, ?, ?, 'ADMIN', ?, 1, ?)
    `);
    const userInfo = userStmt.run(
      orgId,
      normalisedEmail,
      hash,
      adminFullName.trim(),
      nowIso
    );

    res.status(201).json({
      organisation: {
        id: orgId,
        name: normalisedOrg,
        status: "ACTIVE",
        createdAt: nowIso,
      },
      admin: {
        id: userInfo.lastInsertRowid,
        email: normalisedEmail,
        fullName: adminFullName.trim(),
        role: "ADMIN",
        isActive: 1,
        createdAt: nowIso,
      },
    });
  } catch (err) {
    console.error("Error creating provider:", err.message);
    res.status(500).json({ error: "Failed to create provider" });
  }
});

module.exports = router;
