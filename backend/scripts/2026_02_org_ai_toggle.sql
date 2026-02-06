ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Optional index if you ever query by this often (not required now)
-- CREATE INDEX IF NOT EXISTS idx_org_ai_enabled ON organisations(ai_enabled);
