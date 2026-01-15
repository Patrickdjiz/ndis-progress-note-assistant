-- 1) AUDIT EVENTS TABLE (required for your audit.js)
CREATE TABLE IF NOT EXISTS public.audit_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),

  organisation_id integer NULL REFERENCES public.organisations(id),
  actor_user_id integer NULL REFERENCES public.users(id),
  actor_role text NULL,

  action text NOT NULL,
  target_type text NULL,
  target_id integer NULL,

  meta jsonb NULL,

  ip inet NULL,
  user_agent text NULL,
  request_id text NULL,
  path text NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_org_time
  ON public.audit_events (organisation_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_org_id
  ON public.audit_events (organisation_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_action
  ON public.audit_events (action);

CREATE INDEX IF NOT EXISTS idx_audit_target
  ON public.audit_events (target_type, target_id);


-- 2) ORG SETTINGS: retention + purge controls
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS retention_days integer NOT NULL DEFAULT 2555, -- ~7 years (conservative default)
  ADD COLUMN IF NOT EXISTS delete_grace_days integer NOT NULL DEFAULT 30, -- soft-delete grace period
  ADD COLUMN IF NOT EXISTS auto_purge_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.organisations
  ADD CONSTRAINT organisations_retention_days_check
  CHECK (retention_days >= 30 AND retention_days <= 36500);

ALTER TABLE public.organisations
  ADD CONSTRAINT organisations_delete_grace_days_check
  CHECK (delete_grace_days >= 1 AND delete_grace_days <= 365);


-- 3) PROGRESS NOTES: soft delete + legal hold + consent ack + updated_at
ALTER TABLE public.progress_notes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id integer NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS deleted_reason text NULL,

  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold_reason text NULL,
  ADD COLUMN IF NOT EXISTS legal_hold_set_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS legal_hold_set_by_user_id integer NULL REFERENCES public.users(id),

  ADD COLUMN IF NOT EXISTS purged_at timestamptz NULL,

  ADD COLUMN IF NOT EXISTS consent_acknowledged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_acknowledged_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS consent_acknowledged_by_user_id integer NULL REFERENCES public.users(id),

  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_notes_org_deleted
  ON public.progress_notes (organisation_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_notes_org_legal_hold
  ON public.progress_notes (organisation_id, legal_hold);

CREATE INDEX IF NOT EXISTS idx_notes_org_date
  ON public.progress_notes (organisation_id, date DESC);
