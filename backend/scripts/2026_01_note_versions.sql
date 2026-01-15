-- Progress note version history (auditor-grade)
CREATE TABLE IF NOT EXISTS public.progress_note_versions (
  id BIGSERIAL PRIMARY KEY,

  note_id bigint NOT NULL REFERENCES public.progress_notes(id) ON DELETE CASCADE,
  version_no integer NOT NULL,

  -- body-only text snapshot
  text text NOT NULL,

  edited_at timestamptz NOT NULL DEFAULT now(),
  edited_by_user_id integer NULL REFERENCES public.users(id),
  edited_by_name text NULL
);

-- One version number per note
CREATE UNIQUE INDEX IF NOT EXISTS uq_note_versions_note_version
  ON public.progress_note_versions (note_id, version_no);

-- Fast lookup of latest versions per note
CREATE INDEX IF NOT EXISTS idx_note_versions_note_time
  ON public.progress_note_versions (note_id, edited_at DESC);

-- Optional: simple guard
ALTER TABLE public.progress_note_versions
  ADD CONSTRAINT progress_note_versions_version_no_check
  CHECK (version_no >= 1);


