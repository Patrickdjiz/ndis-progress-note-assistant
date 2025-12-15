// scripts/setOwnerAccount.js
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../pgClient");

async function main() {
  const email = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  const fullName = (process.env.OWNER_FULLNAME || "Platform Owner").trim();
  const password = (process.env.OWNER_PASSWORD || "").trim();

  if (!email || !password) {
    console.error("OWNER_EMAIL and OWNER_PASSWORD must be set in .env");
    process.exit(1);
  }

  const hash = bcrypt.hashSync(password, 10);

  try {
    // If there is already an OWNER, update it.
    // If not, create a fresh owner + platform org.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `SELECT id, organisation_id FROM users WHERE role = 'OWNER' LIMIT 1`
      );

      let ownerOrgId;

      if (existing.rows.length > 0) {
        // Update existing owner in-place
        ownerOrgId = existing.rows[0].organisation_id;

        const result = await client.query(
          `
          UPDATE users
          SET email = $1,
              full_name = $2,
              password_hash = $3
          WHERE id = $4
          RETURNING id, email, full_name
        `,
          [email, fullName, hash, existing.rows[0].id]
        );

        console.log("Updated existing OWNER:", result.rows[0]);
      } else {
        // No owner found – create a platform org + owner
        const now = new Date().toISOString();

        const orgRes = await client.query(
          `
          INSERT INTO organisations (name, status, created_at)
          VALUES ($1, 'ACTIVE', $2)
          RETURNING id
        `,
          ["Platform Root Org", now]
        );
        ownerOrgId = orgRes.rows[0].id;

        const userRes = await client.query(
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
          RETURNING id, email, full_name
        `,
          [ownerOrgId, email, hash, fullName, now]
        );

        console.log("Created new OWNER:", userRes.rows[0]);
      }

      await client.query("COMMIT");
      console.log("✅ Owner account ready.");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error setting owner account:", err);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Pool error:", err);
  } finally {
    process.exit(0);
  }
}

main();
