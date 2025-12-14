// scripts/migrateSqliteToPostgres.js
//
// One-off script to copy data from the existing SQLite DB
// into the Postgres schema defined in schema_postgres.sql.

const path = require("path");
const Database = require("better-sqlite3");
const { pool } = require("../pgClient");
const { NODE_ENV } = require("../config/env");

async function main() {
  // 1) Open SQLite in read-only mode
  const sqliteFile =
    NODE_ENV === "production" ? "notes.db" : "notes.dev.db";

  const sqlitePath = path.join(__dirname, "..", sqliteFile);
  console.log(`[migrate] Reading from SQLite file: ${sqlitePath}`);

  const sqlite = new Database(sqlitePath, { readonly: true });

  // 2) Load all data from SQLite
  const orgs = sqlite.prepare("SELECT * FROM organisations").all();
  const users = sqlite.prepare("SELECT * FROM users").all();
  const notes = sqlite.prepare("SELECT * FROM progress_notes").all();

  console.log(
    `[migrate] Found ${orgs.length} org(s), ${users.length} user(s), ${notes.length} note(s)`
  );

  // 3) Start Postgres transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ----- Organisations -----
    const orgIdMap = new Map();

    for (const org of orgs) {
      // org.createdAt in SQLite -> created_at in PG
      const res = await client.query(
        `
        INSERT INTO organisations (id, name, status, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `,
        [org.id, org.name, org.status, org.createdAt]
      );

      const newId = res.rows[0]?.id ?? org.id;
      orgIdMap.set(org.id, newId);
    }

    console.log("[migrate] Organisations migrated.");

    // ----- Users -----
    const userIdMap = new Map();

    for (const u of users) {
      const orgId = orgIdMap.get(u.organisationId);
      if (!orgId) {
        throw new Error(
          `No mapped organisation for user ${u.id} (org ${u.organisationId})`
        );
      }

      const res = await client.query(
        `
        INSERT INTO users (
          id,
          organisation_id,
          email,
          password_hash,
          role,
          full_name,
          is_active,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `,
        [
          u.id,
          orgId,
          u.email,
          u.passwordHash,
          u.role,
          u.fullName,
          !!u.isActive,
          u.createdAt,
        ]
      );

      const newId = res.rows[0]?.id ?? u.id;
      userIdMap.set(u.id, newId);
    }

    console.log("[migrate] Users migrated.");

    // ----- Progress notes -----
    for (const n of notes) {
      const orgId = orgIdMap.get(n.organisationId);
      const workerId = userIdMap.get(n.workerUserId);

      if (!orgId) {
        throw new Error(
          `No mapped organisation for note ${n.id} (org ${n.organisationId})`
        );
      }
      if (!workerId) {
        throw new Error(
          `No mapped worker for note ${n.id} (worker ${n.workerUserId})`
        );
      }

      await client.query(
        `
        INSERT INTO progress_notes (
          id,
          organisation_id,
          worker_user_id,
          participant_name,
          worker_name,
          date,
          start_time,
          end_time,
          location,
          activities_and_supports,
          participant_presentation,
          goals_worked_on,
          incidents_or_risks,
          follow_up_actions,
          note_text,
          incident_flag,
          created_at,
          final_note_text,
          finalised_at,
          finalised_by,
          reviewed_flag,
          reviewed_at,
          reviewed_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        ON CONFLICT (id) DO NOTHING
      `,
        [
          n.id,
          orgId,
          workerId,
          n.participantName,
          n.workerName,
          n.date, // TEXT "YYYY-MM-DD" is fine for DATE
          n.startTime,
          n.endTime,
          n.location,
          n.activitiesAndSupports,
          n.participantPresentation,
          n.goalsWorkedOn,
          n.incidentsOrRisks,
          n.followUpActions,
          n.noteText,
          !!n.incidentFlag,
          n.createdAt,
          n.finalNoteText,
          n.finalisedAt,
          n.finalisedBy,
          !!n.reviewedFlag,
          n.reviewedAt,
          n.reviewedBy,
        ]
      );
    }

    console.log("[migrate] Notes migrated.");

    // ----- Fix sequences so future inserts use the right IDs -----
    await client.query(
      `SELECT setval('organisations_id_seq', COALESCE(MAX(id), 1)) FROM organisations`
    );
    await client.query(
      `SELECT setval('users_id_seq', COALESCE(MAX(id), 1)) FROM users`
    );
    await client.query(
      `SELECT setval('progress_notes_id_seq', COALESCE(MAX(id), 1)) FROM progress_notes`
    );

    await client.query("COMMIT");
    console.log("[migrate] ✅ Migration completed successfully.");
  } catch (err) {
    console.error("[migrate] ❌ Migration failed, rolling back:", err);
    await client.query("ROLLBACK");
  } finally {
    client.release();
    sqlite.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] Unhandled error:", err);
  process.exit(1);
});
