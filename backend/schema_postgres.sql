-- Schema for PostgreSQL database

-- Organisations (providers)
CREATE TABLE IF NOT EXISTS organisations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('ACTIVE', 'SUSPENDED'))
);

-- Users (admins + workers + owner)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  organisation_id INTEGER NOT NULL REFERENCES organisations(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_changed_at TIMESTAMPTZ,
  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  CHECK (role IN ('OWNER', 'ADMIN', 'WORKER'))
);

-- Progress notes
CREATE TABLE IF NOT EXISTS progress_notes (
  id SERIAL PRIMARY KEY,
  organisation_id INTEGER NOT NULL REFERENCES organisations(id),
  worker_user_id INTEGER NOT NULL REFERENCES users(id),

  participant_name TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT NOT NULL,

  activities_and_supports TEXT NOT NULL,
  participant_presentation TEXT NOT NULL,
  goals_worked_on TEXT NOT NULL,
  incidents_or_risks TEXT NOT NULL,
  follow_up_actions TEXT NOT NULL,

  note_text TEXT NOT NULL,
  incident_flag BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  final_note_text TEXT,
  finalised_at TIMESTAMPTZ,
  finalised_by TEXT,

  reviewed_flag BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,

  archived_flag BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by TEXT
);

-- Audit events (compliance logging)
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  organisation_id INTEGER REFERENCES organisations(id),
  actor_user_id INTEGER REFERENCES users(id),
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta JSONB,
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_users_org ON users (organisation_id);

CREATE INDEX IF NOT EXISTS idx_notes_org_created ON progress_notes (organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_org_worker ON progress_notes (organisation_id, worker_user_id);
CREATE INDEX IF NOT EXISTS idx_notes_org_participant ON progress_notes (organisation_id, participant_name);
CREATE INDEX IF NOT EXISTS idx_notes_org_incident ON progress_notes (organisation_id, incident_flag);
CREATE INDEX IF NOT EXISTS idx_notes_org_archived ON progress_notes (organisation_id, archived_flag);

-- For ILIKE '%term%' searches (fast substring search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_notes_participant_trgm
ON progress_notes USING gin (participant_name gin_trgm_ops);

-- Archived filter + pagination/order
CREATE INDEX IF NOT EXISTS idx_notes_org_archived_created_id
ON progress_notes (organisation_id, archived_flag, created_at DESC, id DESC);

-- Incident filter + pagination/order
CREATE INDEX IF NOT EXISTS idx_notes_org_incident_created_id
ON progress_notes (organisation_id, incident_flag, created_at DESC, id DESC);

-- Cursor pagination indexes
CREATE INDEX IF NOT EXISTS idx_notes_org_created_id
  ON progress_notes (organisation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notes_org_worker_created_id
  ON progress_notes (organisation_id, worker_user_id, created_at DESC, id DESC);

-- Audit indexes
CREATE INDEX IF NOT EXISTS idx_audit_org_created
  ON audit_events (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor_created
  ON audit_events (actor_user_id, created_at DESC);


