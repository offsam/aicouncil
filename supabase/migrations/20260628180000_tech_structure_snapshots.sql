-- TD-03B: before-snapshot storage for destructive structure plans (non-executable in 03B).

CREATE TABLE IF NOT EXISTS tech_structure_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES tech_structure_plans(id) ON DELETE CASCADE,
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL DEFAULT 'before' CHECK (snapshot_type = 'before'),
  entities JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tech_structure_snapshots_plan
  ON tech_structure_snapshots (plan_id);

ALTER TABLE tech_structure_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tech_structure_snapshots'
      AND policyname = 'Allow all for tech_structure_snapshots'
  ) THEN
    CREATE POLICY "Allow all for tech_structure_snapshots"
      ON tech_structure_snapshots FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE tech_structure_plans
  ADD COLUMN IF NOT EXISTS plan_kind TEXT NOT NULL DEFAULT 'create'
    CHECK (plan_kind IN ('create', 'destructive'));

ALTER TABLE tech_structure_plans
  ADD COLUMN IF NOT EXISTS impact_analysis JSONB;

ALTER TABLE tech_structure_plans
  ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES tech_structure_snapshots(id) ON DELETE SET NULL;
