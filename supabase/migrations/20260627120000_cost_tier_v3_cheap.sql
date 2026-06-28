-- Cost tier v3: agents_cost_tier_check accepts 4 tiers (free / cheap / mid / premium).
-- Constraint only — existing agent rows are not modified.

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
  ADD CONSTRAINT agents_cost_tier_check
  CHECK (cost_tier IN ('free', 'cheap', 'mid', 'premium'));
