-- Cost tier v2: free / mid / premium
-- Backward-compatible migration from free / cheap / expensive.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
    INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.agents'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%cost_tier%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agents DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE agents
  ALTER COLUMN cost_tier DROP DEFAULT;

UPDATE agents
SET cost_tier = CASE
  WHEN id IN (
    'a1000001-0000-4000-8000-000000000001',
    'a1000002-0000-4000-8000-000000000002'
  ) THEN 'premium'
  WHEN id = 'a100000b-0000-4000-8000-00000000000b' THEN 'mid'
  WHEN id IN (
    'a1000003-0000-4000-8000-000000000003',
    'a1000004-0000-4000-8000-000000000004',
    'a1000005-0000-4000-8000-000000000005',
    'a1000006-0000-4000-8000-000000000006',
    'a1000007-0000-4000-8000-000000000007',
    'a1000008-0000-4000-8000-000000000008',
    'a1000009-0000-4000-8000-000000000009',
    'a100000a-0000-4000-8000-00000000000a'
  ) THEN 'free'
  WHEN cost_tier = 'cheap' THEN 'mid'
  WHEN cost_tier = 'expensive' THEN 'premium'
  WHEN cost_tier = 'free' THEN 'free'
  ELSE 'mid'
END;

ALTER TABLE agents
  ALTER COLUMN cost_tier SET DEFAULT 'free';

ALTER TABLE agents
  ADD CONSTRAINT agents_cost_tier_check
  CHECK (cost_tier IN ('free', 'mid', 'premium'));

