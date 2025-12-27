-- Organisations (providers)
CREATE TABLE organisations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('ACTIVE', 'SUSPENDED'))
);

-- Users (admins + workers + owner)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  organisation_id INTEGER NOT NULL REFERENCES organisations(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (role IN ('OWNER', 'ADMIN', 'WORKER'))
);

-- Progress notes
CREATE TABLE progress_notes (
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

  -- final note fields
  final_note_text TEXT,
  finalised_at TIMESTAMPTZ,
  finalised_by TEXT,

  -- provider review fields
  reviewed_flag BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

ALTER TABLE users
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN password_changed_at TIMESTAMPTZ,
  ADD COLUMN reset_token_hash TEXT,
  ADD COLUMN reset_token_expires_at TIMESTAMPTZ;
  
ALTER TABLE progress_notes
  ADD COLUMN IF NOT EXISTS archived_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_org_archived ON progress_notes (organisation_id, archived_flag);


-- Helpful indexes
CREATE INDEX idx_users_org ON users (organisation_id);
CREATE INDEX idx_notes_org_created ON progress_notes (organisation_id, created_at DESC);
CREATE INDEX idx_notes_org_worker ON progress_notes (organisation_id, worker_user_id);
CREATE INDEX idx_notes_org_participant ON progress_notes (organisation_id, participant_name);
CREATE INDEX idx_notes_org_incident ON progress_notes (organisation_id, incident_flag);
