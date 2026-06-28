-- Pending structure plans for Tech Department confirmation gate (Block 3).

CREATE TABLE IF NOT EXISTS tech_structure_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_text TEXT NOT NULL,
  plan_summary TEXT NOT NULL,
  actions JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  executed_at TIMESTAMPTZ,
  execution_result JSONB
);

CREATE INDEX IF NOT EXISTS idx_tech_structure_plans_status_expires
  ON tech_structure_plans (status, expires_at);

ALTER TABLE tech_structure_plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tech_structure_plans'
      AND policyname = 'Allow all for tech_structure_plans'
  ) THEN
    CREATE POLICY "Allow all for tech_structure_plans"
      ON tech_structure_plans FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
