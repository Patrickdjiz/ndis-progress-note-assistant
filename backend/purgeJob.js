// backend/purgeJob.js
const { query } = require("./dbAdapter");

// Use a stable advisory lock key (Postgres only)
async function tryAdvisoryLock() {
  const { rows } = await query(
    `SELECT pg_try_advisory_lock(hashtext('ndisnotes_purge_job')::bigint) AS locked`
  );
  return !!rows?.[0]?.locked;
}

async function releaseAdvisoryLock() {
  await query(`SELECT pg_advisory_unlock(hashtext('ndisnotes_purge_job')::bigint)`);
}

async function purgeOnce() {
  const locked = await tryAdvisoryLock();
  if (!locked) return;

  try {
    await query(`
      WITH candidates AS (
        SELECT p.id, p.organisation_id
        FROM progress_notes p
        JOIN organisations o ON o.id = p.organisation_id
        WHERE p.legal_hold = false
          AND (
            (
                p.deleted_at IS NOT NULL
                AND p.deleted_at < now() - make_interval(days => COALESCE(o.delete_grace_days, 30))
            )
            OR
            (
                o.auto_purge_enabled = true
                AND (p.date::date) < (current_date - COALESCE(o.retention_days, 365))
            )
        )
        ORDER BY p.id
        LIMIT 500
      ),
      del_versions AS (
        DELETE FROM progress_note_versions v
        USING candidates c
        WHERE v.note_id = c.id
        RETURNING v.note_id
      ),
      deleted AS (
        DELETE FROM progress_notes p
        USING candidates c
        WHERE p.id = c.id
        RETURNING p.id, p.organisation_id
      )
      INSERT INTO audit_events (organisation_id, actor_role, action, target_type, target_id, meta)
      SELECT d.organisation_id, 'SYSTEM', 'NOTE_PURGED', 'progress_note', d.id::text,
             jsonb_build_object('source','purge_job')
      FROM deleted d;
    `);
  } catch (e) {
    console.error("purgeOnce error:", e?.message || e);
  } finally {
    try { await releaseAdvisoryLock(); } catch (e) {
      console.error("releaseAdvisoryLock error:", e?.message || e);
    }
  }
}

function startPurgeJob() {
  if (String(process.env.PURGE_JOB_ENABLED || "").toLowerCase() !== "true") return;

  // Run once on boot, then daily
  purgeOnce().catch((e) => console.error("purgeOnce error:", e?.message || e));
  setInterval(() => purgeOnce().catch((e) => console.error("purgeOnce error:", e?.message || e)), 24 * 60 * 60 * 1000).unref();
}


module.exports = { startPurgeJob };
