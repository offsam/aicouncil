-- Phase 1C.3: external_entry seed — AI Council only.
-- JSONB merge preserves existing canvas keys; id-based UPDATE.

DO $$
DECLARE
  n int;
  flagged int;
BEGIN
  SELECT COUNT(*) INTO flagged
  FROM offices
  WHERE (workspace_meta->'external_entry') = 'true'::jsonb;

  IF flagged > 0 THEN
    RAISE EXCEPTION 'Phase 1C.3 preflight: % row(s) already have external_entry=true', flagged;
  END IF;

  UPDATE offices
  SET workspace_meta = workspace_meta || '{"external_entry": true}'::jsonb
  WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    AND COALESCE((workspace_meta->'external_entry')::boolean, false) IS NOT TRUE;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Phase 1C.3 external_entry seed: expected 1 row updated, got %', n;
  END IF;
END $$;
