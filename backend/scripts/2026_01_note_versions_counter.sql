BEGIN;

-- 0) Ensure versions table exists (safe)
CREATE TABLE IF NOT EXISTS public.progress_note_versions (
  id bigserial PRIMARY KEY,
  note_id integer NOT NULL REFERENCES public.progress_notes(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  text text NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  edited_by_user_id integer,
  edited_by_name text
);

-- unique per note/version + helpful index
CREATE UNIQUE INDEX IF NOT EXISTS uq_progress_note_versions_note_version
  ON public.progress_note_versions(note_id, version_no);

CREATE INDEX IF NOT EXISTS idx_progress_note_versions_note_id
  ON public.progress_note_versions(note_id, version_no DESC);

-- 1) Add counter on notes
ALTER TABLE public.progress_notes
  ADD COLUMN IF NOT EXISTS current_version_no integer NOT NULL DEFAULT 0;

-- 2) Backfill: create initial version rows for notes that have none
INSERT INTO public.progress_note_versions (note_id, version_no, text, edited_at, edited_by_user_id, edited_by_name)
SELECT
  pn.id,
  1,
  COALESCE(NULLIF(pn.final_note_text, ''), pn.note_text),
  COALESCE(pn.finalised_at, pn.created_at, now()),
  NULL,
  COALESCE(pn.finalised_by, pn.worker_name, 'System')
FROM public.progress_notes pn
WHERE NOT EXISTS (
  SELECT 1 FROM public.progress_note_versions v WHERE v.note_id = pn.id
);

-- 3) Set current_version_no to max(version_no) per note
UPDATE public.progress_notes pn
SET current_version_no = v.max_v
FROM (
  SELECT note_id, MAX(version_no) AS max_v
  FROM public.progress_note_versions
  GROUP BY note_id
) v
WHERE pn.id = v.note_id;

-- 4) Any stragglers: default to 1 (practically none after steps above)
UPDATE public.progress_notes
SET current_version_no = 1
WHERE current_version_no = 0;

COMMIT;
