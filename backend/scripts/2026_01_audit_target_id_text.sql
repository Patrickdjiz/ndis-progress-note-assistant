-- 2026_01_audit_target_id_text.sql

DO $$
DECLARE
  dt text;
BEGIN
  SELECT c.data_type
  INTO dt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name   = 'audit_events'
    AND c.column_name  = 'target_id';

  -- If column missing, do nothing
  IF dt IS NULL THEN
    RAISE NOTICE 'audit_events.target_id does not exist; skipping';
    RETURN;
  END IF;

  -- Already text/varchar? Skip
  IF dt IN ('text', 'character varying') THEN
    RAISE NOTICE 'audit_events.target_id already text-like (%); skipping', dt;
    RETURN;
  END IF;

  -- Otherwise convert to text
  EXECUTE 'ALTER TABLE public.audit_events ALTER COLUMN target_id TYPE text USING target_id::text';
  RAISE NOTICE 'Converted audit_events.target_id from % to text', dt;
END $$;
