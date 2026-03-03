// backend/retentionPurgeJob.js
const { pool } = require("./pgClient");

const LOCK_KEY = 91345217;
const APP_TZ = process.env.APP_TZ || "Australia/Sydney";

// Configurable batch sizes (safe defaults)
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const SOFT_DELETE_BATCH = clamp(Number(process.env.SOFT_DELETE_BATCH || 1000), 100, 10000);
const PURGE_BATCH = clamp(Number(process.env.PURGE_BATCH || 300), 50, 1000);

// small helper to match your dbAdapter return shape
async function q(client, sql, params = []) {
  const res = await client.query(sql, params);
  return { rows: res.rows, rowCount: res.rowCount };
}

async function tryLock(client) {
  const { rows } = await q(client, `SELECT pg_try_advisory_lock($1) AS locked`, [LOCK_KEY]);
  return rows?.[0]?.locked === true;
}

async function unlock(client) {
  await q(client, `SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
}

async function runOnceForOrg(client, orgId) {
  // 1) Soft delete
  const softDeleteSql = `
    WITH org AS (
      SELECT id,
             COALESCE(retention_days, 30) AS retention_days,
             auto_purge_enabled
      FROM organisations
      WHERE id = $1
      LIMIT 1
    ),
    candidates AS (
      SELECT pn.id
      FROM progress_notes pn
      JOIN org o ON o.id = pn.organisation_id
      WHERE pn.organisation_id = $1
        AND o.auto_purge_enabled = TRUE
        AND pn.deleted_at IS NULL
        AND pn.purged_at IS NULL
        AND COALESCE(pn.legal_hold, FALSE) = FALSE
        AND (pn.date::date) < ((now() AT TIME ZONE ($3::text))::date - o.retention_days)
      ORDER BY pn.date::date ASC, pn.id ASC
      LIMIT $2
    ),
    updated AS (
      UPDATE progress_notes pn
      SET deleted_at = now(),
          deleted_by = 'SYSTEM',
          deleted_reason = 'retention_expired',
          updated_at = now()
      WHERE pn.id IN (SELECT id FROM candidates)
      RETURNING pn.id
    )
    INSERT INTO audit_events (
      occurred_at, organisation_id, actor_user_id, actor_role,
      action, target_type, target_id, meta, ip, user_agent, request_id, path
    )
    SELECT
      now(), $1, NULL, 'SYSTEM',
      'NOTE_DELETED_RETENTION', 'progress_note', u.id::text,
      jsonb_build_object('reason','retention_expired','tz',($3::text)),
      NULL, NULL, 'SYSTEM', '/jobs/retention'
    FROM updated u
    RETURNING 1
  `;

  const soft = await q(client, softDeleteSql, [orgId, SOFT_DELETE_BATCH, APP_TZ]);
  const softCount = soft.rowCount || 0;

  // 2) Purge
  const purgeSql = `
    WITH org AS (
      SELECT id,
             COALESCE(delete_grace_days, 7) AS delete_grace_days,
             auto_purge_enabled
      FROM organisations
      WHERE id = $1
      LIMIT 1
    ),
    candidates AS (
      SELECT pn.id
      FROM progress_notes pn
      JOIN org o ON o.id = pn.organisation_id
      WHERE pn.organisation_id = $1
        AND o.auto_purge_enabled = TRUE
        AND pn.deleted_at IS NOT NULL
        AND pn.purged_at IS NULL
        AND COALESCE(pn.legal_hold, FALSE) = FALSE
        AND pn.deleted_at < (now() - make_interval(days => o.delete_grace_days))
      ORDER BY pn.deleted_at ASC, pn.id ASC
      LIMIT $2
    ),
    del_versions AS (
      DELETE FROM progress_note_versions v
      WHERE v.note_id IN (SELECT id FROM candidates)
      RETURNING v.note_id
    ),
    purged AS (
      UPDATE progress_notes pn
      SET purged_at = now(),
          note_text = '',
          final_note_text = NULL,
          participant_name = '[PURGED]',
          worker_name = '[PURGED]',
          location = '[PURGED]',
          finalised_by = NULL,
          reviewed_by = NULL,
          archived_by = NULL,
          updated_at = now()
      WHERE pn.id IN (SELECT id FROM candidates)
      RETURNING pn.id
    )
    INSERT INTO audit_events (
      occurred_at, organisation_id, actor_user_id, actor_role,
      action, target_type, target_id, meta, ip, user_agent, request_id, path
    )
    SELECT
      now(), $1, NULL, 'SYSTEM',
      'NOTE_PURGED', 'progress_note', p.id::text,
      jsonb_build_object('mode','tombstone','tz',($3::text)),
      NULL, NULL, 'SYSTEM', '/jobs/retention'
    FROM purged p
    RETURNING 1
  `;

  const pur = await q(client, purgeSql, [orgId, PURGE_BATCH, APP_TZ]);
  const purgeCount = pur.rowCount || 0;

  return { softCount, purgeCount };
}

async function runRetentionPurgeJob() {
  const client = await pool.connect();

  try {
    const locked = await tryLock(client);
    if (!locked) return { ok: true, skipped: true, reason: "lock_not_acquired" };

    try {
      const { rows: orgs } = await q(
        client,
        `SELECT id FROM organisations WHERE auto_purge_enabled = TRUE ORDER BY id`
      );

      let totalSoft = 0;
      let totalPurge = 0;

      for (const o of orgs) {
        for (;;) {
          const { softCount, purgeCount } = await runOnceForOrg(client, o.id);
          totalSoft += softCount;
          totalPurge += purgeCount;
          if (softCount === 0 && purgeCount === 0) break;
        }
      }

      return { ok: true, totalSoft, totalPurge, softBatch: SOFT_DELETE_BATCH, purgeBatch: PURGE_BATCH, tz: APP_TZ };
    } finally {
      await unlock(client);
    }
  } finally {
    client.release();
  }
}

module.exports = { runRetentionPurgeJob };
