-- Sprint 4.5: technical debt — entity_registry_id, agent_assignments, knowledge backfill

-- 1. Backfill entity_registry_id on rules/knowledge (same join as Sprint 2)
UPDATE knowledge k
SET entity_registry_id = e.id
FROM entity_registry e
WHERE e.entity_type = k.entity_type
  AND e.id = k.entity_id
  AND k.entity_registry_id IS NULL;

UPDATE rules r
SET entity_registry_id = e.id
FROM entity_registry e
WHERE e.entity_type = r.entity_type
  AND e.id = r.entity_id
  AND r.entity_registry_id IS NULL;

-- 2. Final knowledge_base → knowledge (skip rows already linked by id)
INSERT INTO knowledge (
  id,
  entity_type,
  entity_id,
  entity_registry_id,
  object_id,
  title,
  content,
  file_url,
  created_at
)
SELECT
  kb.id,
  'city',
  kb.office_id,
  kb.office_id,
  NULL,
  kb.title,
  kb.content,
  NULL,
  kb.created_at
FROM knowledge_base kb
WHERE NOT EXISTS (SELECT 1 FROM knowledge k WHERE k.id = kb.id)
ON CONFLICT (id) DO NOTHING;

-- Re-sync registry id for any knowledge_base rows that were inserted above
UPDATE knowledge k
SET entity_registry_id = e.id
FROM entity_registry e
WHERE k.entity_registry_id IS NULL
  AND e.entity_type = k.entity_type
  AND e.id = k.entity_id;

UPDATE rules r
SET entity_registry_id = e.id
FROM entity_registry e
WHERE r.entity_registry_id IS NULL
  AND e.entity_type = r.entity_type
  AND e.id = r.entity_id;

-- 3. NOT NULL (only if no orphans remain)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM knowledge WHERE entity_registry_id IS NULL) THEN
    ALTER TABLE knowledge ALTER COLUMN entity_registry_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rules WHERE entity_registry_id IS NULL) THEN
    ALTER TABLE rules ALTER COLUMN entity_registry_id SET NOT NULL;
  END IF;
END $$;

-- 4. Indexes for buildContext hot path
CREATE INDEX IF NOT EXISTS idx_knowledge_registry ON knowledge (entity_registry_id);
CREATE INDEX IF NOT EXISTS idx_rules_registry ON rules (entity_registry_id);

-- 5. agent_assignments (many-to-many agent ↔ chamber)
CREATE TABLE IF NOT EXISTS agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  chamber_id UUID NOT NULL REFERENCES chambers(id) ON DELETE CASCADE,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, chamber_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_assignments_agent ON agent_assignments (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_chamber ON agent_assignments (chamber_id);

ALTER TABLE agent_assignments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_assignments'
      AND policyname = 'Allow all for agent_assignments'
  ) THEN
    CREATE POLICY "Allow all for agent_assignments"
      ON agent_assignments FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
