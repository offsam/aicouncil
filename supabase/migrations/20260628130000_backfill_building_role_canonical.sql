-- Phase 1C.2: building_role backfill — canonical City Hall + Tech Department only.
-- Id-based UPDATE; fails if row count is not exactly 1 per target.

DO $$
DECLARE
  n int;
BEGIN
  UPDATE entity_registry
  SET building_role = 'city_hall'
  WHERE id = 'aa5c2d68-cf23-4290-b9fa-3f83446c1a4f'
    AND building_role IS NULL;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Phase 1C.2 City Hall backfill: expected 1 row updated, got %', n;
  END IF;

  UPDATE entity_registry
  SET building_role = 'tech_department'
  WHERE id = 'a1000000-0000-4000-8000-000000000001'
    AND building_role IS NULL;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Phase 1C.2 Tech Department backfill: expected 1 row updated, got %', n;
  END IF;
END $$;
