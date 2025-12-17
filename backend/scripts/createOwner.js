// scripts/createOwner.js
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool, query } = require("../pgClient");

async function main() {
  try {
    const email = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
    const password = process.env.OWNER_PASSWORD;
    const fullName = process.env.OWNER_FULLNAME || "Platform Owner";

    if (!email || !password) {
      console.error(
        "Set OWNER_EMAIL and OWNER_PASSWORD (and optionally OWNER_FULL_NAME) in your .env before running this script."
      );
      process.exit(1);
    }

    // Check if an OWNER already exists
    const { rows: existingOwners } = await query(
      `SELECT id, email FROM users WHERE role = 'OWNER' LIMIT 1`
    );

    if (existingOwners[0]) {
      console.log(
        "Owner already exists:",
        existingOwners[0].email,
        "(id:",
        existingOwners[0].id,
        ")"
      );
      process.exit(0);
    }

    const nowIso = new Date().toISOString();
    const orgName = process.env.OWNER_ORG_NAME || "Platform Root Org";

    // Create org
    const orgRes = await query(
      `
        INSERT INTO organisations (name, status, created_at)
        VALUES ($1, 'ACTIVE', $2)
        RETURNING id
      `,
      [orgName, nowIso]
    );

    const orgId = orgRes.rows[0].id;

    // Create OWNER user
    const hash = bcrypt.hashSync(password, 10);

    const userRes = await query(
      `
        INSERT INTO users (
          organisation_id,
          email,
          password_hash,
          role,
          full_name,
          is_active,
          created_at
        )
        VALUES ($1, $2, $3, 'OWNER', $4, TRUE, $5)
        RETURNING id, email
      `,
      [orgId, email, hash, fullName, nowIso]
    );

    const owner = userRes.rows[0];

    console.log("✅ Owner created successfully:");
    console.log("  Email:", owner.email);
    console.log("  ID:   ", owner.id);
    console.log("  Org:  ", orgId);
  } catch (err) {
    console.error("Error creating owner:", err);
    process.exit(1);
  } finally {
    // close pool so script exits
    await pool.end().catch(() => {});
  }
}

main();
