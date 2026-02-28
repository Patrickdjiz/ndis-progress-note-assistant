-- Schema for PostgreSQL database (provider-ready)
-- Matches your current production structure (notes + versions + audit + retention fields)

-- Extensions (needed for trigram search indexes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Organisations (providers)
CREATE TABLE IF NOT EXISTS organisations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Provider-ready retention controls (optional, but you already migrated these in prod)
  retention_days INTEGER NOT NULL DEFAULT 2555,        -- ~7 years
  delete_grace_days INTEGER NOT NULL DEFAULT 30,       -- soft-delete grace period
  auto_purge_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  CHECK (retention_days >= 30 AND retention_days <= 36500),
  CHECK (delete_grace_days >= 1 AND delete_grace_days <= 365)
);

-- Users (admins + workers + owner)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,

  -- ✅ OWNER can be org-less; ADMIN/WORKER must belong to an org
  organisation_id INTEGER REFERENCES organisations(id),

  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,

  role TEXT NOT NULL,
  full_name TEXT NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_changed_at TIMESTAMPTZ,
  session_revoked_at TIMESTAMPTZ,

  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMPTZ,

  CHECK (role IN ('OWNER', 'ADMIN', 'WORKER')),

  -- ✅ enforce org required unless OWNER
  CONSTRAINT chk_users_org_required
    CHECK (role = 'OWNER' OR organisation_id IS NOT NULL)
);

-- Privacy notice acceptances (per-user, per-version)
CREATE TABLE IF NOT EXISTS privacy_acceptances (
  id BIGSERIAL PRIMARY KEY,

  organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  policy_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  ip INET,
  user_agent TEXT,

  UNIQUE (user_id, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_privacy_acceptances_user
  ON privacy_acceptances (user_id);

CREATE INDEX IF NOT EXISTS idx_privacy_accept_org_time
  ON privacy_acceptances (organisation_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_accept_user_time
  ON privacy_acceptances (user_id, accepted_at DESC);


-- Progress notes
-- NOTE: id is integer in your current prod table (per \d+). Keep SERIAL here to match.
CREATE TABLE IF NOT EXISTS progress_notes (
  id SERIAL PRIMARY KEY,

  organisation_id INTEGER NOT NULL REFERENCES organisations(id), 
-- plus the CHECK constraint as above

  worker_user_id INTEGER NOT NULL REFERENCES users(id),

  participant_name TEXT NOT NULL,
  worker_name TEXT NOT NULL,

  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT NOT NULL,

  -- Stored note body (your “minimised” stored content)
  note_text TEXT NOT NULL,

  incident_flag BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Finalise / review / archive workflow
  final_note_text TEXT,
  finalised_at TIMESTAMPTZ,
  finalised_by TEXT,

  reviewed_flag BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,

  archived_flag BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,

  -- Soft delete + legal hold + purge
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id INTEGER REFERENCES users(id),
  deleted_by TEXT,
  deleted_reason TEXT,

  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  legal_hold_reason TEXT,
  legal_hold_set_at TIMESTAMPTZ,
  legal_hold_set_by_user_id INTEGER REFERENCES users(id),
  legal_hold_set_by TEXT,

  purged_at TIMESTAMPTZ,

  -- Consent acknowledgement
  consent_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  consent_acknowledged_at TIMESTAMPTZ,
  consent_acknowledged_by_user_id INTEGER REFERENCES users(id),

  -- Versioning counter
  current_version_no INTEGER NOT NULL DEFAULT 0
);

-- Progress note versions (immutable history snapshots)
-- IMPORTANT: In prod, note_id is BIGINT and references progress_notes(id) (integer)
-- Postgres allows that, so we mirror it exactly.
CREATE TABLE IF NOT EXISTS progress_note_versions (
  id BIGSERIAL PRIMARY KEY,
  note_id BIGINT NOT NULL REFERENCES progress_notes(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL CHECK (version_no >= 1),
  text TEXT NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_by_user_id INTEGER REFERENCES users(id),
  edited_by_name TEXT,
  CONSTRAINT uq_note_versions_note_version UNIQUE (note_id, version_no)
);

-- Audit events (compliance logging)
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  organisation_id INTEGER REFERENCES organisations(id),
  actor_user_id INTEGER REFERENCES users(id),
  actor_role TEXT,

  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta JSONB,

  ip INET,
  user_agent TEXT,

  request_id TEXT,
  path TEXT
);

-- =========================
-- Indexes
-- =========================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_org ON users (organisation_id);

-- Notes: pagination & scoping
CREATE INDEX IF NOT EXISTS idx_notes_org_created_id
  ON progress_notes (organisation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notes_org_worker_created_id
  ON progress_notes (organisation_id, worker_user_id, created_at DESC, id DESC);

-- Notes: fast filters
CREATE INDEX IF NOT EXISTS idx_notes_org_archived
  ON progress_notes (organisation_id, archived_flag);

CREATE INDEX IF NOT EXISTS idx_notes_org_incident
  ON progress_notes (organisation_id, incident_flag);

CREATE INDEX IF NOT EXISTS idx_notes_org_deleted_at
  ON progress_notes (organisation_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_notes_org_legal_hold
  ON progress_notes (organisation_id, legal_hold);

-- Notes: participant search (substring)
CREATE INDEX IF NOT EXISTS idx_notes_participant_trgm
  ON progress_notes USING gin (participant_name gin_trgm_ops);

-- Notes: optional helper indexes (you have some of these in prod)
CREATE INDEX IF NOT EXISTS idx_notes_org_participant
  ON progress_notes (organisation_id, participant_name);

CREATE INDEX IF NOT EXISTS idx_notes_org_worker
  ON progress_notes (organisation_id, worker_user_id);

CREATE INDEX IF NOT EXISTS idx_notes_org_created
  ON progress_notes (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_org_date
  ON progress_notes (organisation_id, date DESC);

-- Versions: fast history retrieval
CREATE INDEX IF NOT EXISTS idx_note_versions_note_time
  ON progress_note_versions (note_id, edited_at DESC);

-- Audit: org timeline + lookups
CREATE INDEX IF NOT EXISTS idx_audit_org_time
  ON audit_events (organisation_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_org_id
  ON audit_events (organisation_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_action
  ON audit_events (action);

CREATE INDEX IF NOT EXISTS idx_audit_target
  ON audit_events (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_audit_actor_created
  ON audit_events (actor_user_id, occurred_at DESC);

-- Retention job helper indexes (faster candidate scans)
CREATE INDEX IF NOT EXISTS idx_pn_retention_candidates
ON progress_notes (organisation_id, date, id)
WHERE deleted_at IS NULL AND legal_hold = FALSE;

CREATE INDEX IF NOT EXISTS idx_pn_purge_candidates
ON progress_notes (organisation_id, deleted_at, id)
WHERE deleted_at IS NOT NULL AND purged_at IS NULL AND legal_hold = FALSE;

