// jobs/retentionPurgeJob.js
const { query } = require("../dbAdapter");

// Use a fixed advisory lock key (any int is fine; keep stable)
const LOCK_KEY = 91345217;

async function tryLock() {
  const { rows } = await query(`SELECT pg_try_advisory_lock($1) AS locked`, [LOCK_KEY]);
  return rows?.[0]?.locked === true;
}

async function unlock() {
  await query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
}

async function runOnceForOrg(orgId) {
  // 1) Soft-delete notes past retention_days (if auto_purge_enabled)
  // Uses progress_notes.date as the anchor; adjust to created_at if you prefer.
  const softDeleteSql = `
    WITH org AS (
      SELECT id, retention_days, auto_purge_enabled
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
        AND pn.legal_hold = FALSE
        AND pn.date < (CURRENT_DATE - (o.retention_days || ' days')::interval)
      ORDER BY pn.id
      LIMIT 500
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
      jsonb_build_object('reason','retention_expired'),
      NULL, NULL, 'SYSTEM', '/jobs/retention'
    FROM updated u
    RETURNING 1
  `;

  const soft = await query(softDeleteSql, [orgId]);
  const softCount = soft.rowCount || 0;

  // 2) Purge notes deleted longer than delete_grace_days (if auto_purge_enabled)
  // Purge strategy: tombstone the row (keep id + dates) but wipe content + PII,
  // and delete all versions (which contain the content).
  const purgeSql = `
    WITH org AS (
      SELECT id, delete_grace_days, auto_purge_enabled
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
        AND pn.legal_hold = FALSE
        AND pn.deleted_at < (now() - (o.delete_grace_days || ' days')::interval)
      ORDER BY pn.id
      LIMIT 300
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
      jsonb_build_object('mode','tombstone'),
      NULL, NULL, 'SYSTEM', '/jobs/retention'
    FROM purged p
    RETURNING 1
  `;

  const pur = await query(purgeSql, [orgId]);
  const purgeCount = pur.rowCount || 0;

  return { softCount, purgeCount };
}

async function runRetentionPurgeJob() {
  const locked = await tryLock();
  if (!locked) return { ok: true, skipped: true, reason: "lock_not_acquired" };

  try {
    const { rows: orgs } = await query(
      `SELECT id FROM organisations WHERE auto_purge_enabled = TRUE ORDER BY id`
    );

    let totalSoft = 0;
    let totalPurge = 0;

    for (const o of orgs) {
      // Process batches until no more work for this org
      for (;;) {
        const { softCount, purgeCount } = await runOnceForOrg(o.id);
        totalSoft += softCount;
        totalPurge += purgeCount;

        if (softCount === 0 && purgeCount === 0) break;
      }
    }

    return { ok: true, totalSoft, totalPurge };
  } finally {
    await unlock();
  }
}

module.exports = { runRetentionPurgeJob };
