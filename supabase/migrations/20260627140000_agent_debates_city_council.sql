-- Agent debate pipeline + City Hall routing_role fix + chamber «Совет города»

-- ---------------------------------------------------------------------------
-- 1. Debate tables (separate from routing_logs / connection_logs / archive)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_debates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  closed_reason TEXT
    CHECK (closed_reason IS NULL OR closed_reason IN ('confirmed', 'attempts_exhausted')),
  caller_entity_id UUID NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
  caller_kind TEXT NOT NULL CHECK (caller_kind IN ('mayor', 'chamber_manager')),
  debate_chamber_id UUID NOT NULL REFERENCES chambers(id) ON DELETE CASCADE,
  agent_a_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_b_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  initiator_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  current_turn_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  current_answer TEXT NOT NULL DEFAULT '',
  tier_mode JSONB NOT NULL,
  revisions_used_a INTEGER NOT NULL DEFAULT 0 CHECK (revisions_used_a >= 0 AND revisions_used_a <= 3),
  revisions_used_b INTEGER NOT NULL DEFAULT 0 CHECK (revisions_used_b >= 0 AND revisions_used_b <= 3),
  final_answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_debates_chamber ON agent_debates (debate_chamber_id);
CREATE INDEX IF NOT EXISTS idx_agent_debates_caller ON agent_debates (caller_entity_id);
CREATE INDEX IF NOT EXISTS idx_agent_debates_status ON agent_debates (status);

CREATE TABLE IF NOT EXISTS agent_debate_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES agent_debates(id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN ('initial', 'confirm', 'critical_revision', 'accept', 'counter_revision')),
  content TEXT NOT NULL DEFAULT '',
  optional_notes TEXT,
  critical_issues TEXT,
  accepted_previous BOOLEAN,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (debate_id, round_index)
);

CREATE INDEX IF NOT EXISTS idx_agent_debate_rounds_debate ON agent_debate_rounds (debate_id);

ALTER TABLE agent_debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_debate_rounds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_debates' AND policyname = 'Allow all for agent_debates'
  ) THEN
    CREATE POLICY "Allow all for agent_debates" ON agent_debates FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_debate_rounds' AND policyname = 'Allow all for agent_debate_rounds'
  ) THEN
    CREATE POLICY "Allow all for agent_debate_rounds" ON agent_debate_rounds FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. City Hall: Mayor chamber ONLY via routing_role = 'main'
-- ---------------------------------------------------------------------------

-- Ensure DeepSeek is cheap-tier for council tier isolation (idempotent).
UPDATE agents
SET cost_tier = 'cheap'
WHERE id = 'a1000004-0000-4000-8000-000000000004'
  AND cost_tier IS DISTINCT FROM 'cheap';

-- If no main chamber in City Hall — assign oldest chamber as main.
WITH city_hall AS (
  SELECT ch.id AS building_object_id
  FROM office_objects ch
  WHERE ch.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    AND ch.object_type = 'room'
    AND TRIM(ch.label) = 'City Hall'
  LIMIT 1
),
main_exists AS (
  SELECT 1
  FROM chambers c
  INNER JOIN city_hall ch ON c.building_object_id = ch.building_object_id
  WHERE c.routing_role = 'main'
  LIMIT 1
),
oldest AS (
  SELECT c.id
  FROM chambers c
  INNER JOIN city_hall ch ON c.building_object_id = ch.building_object_id
  ORDER BY c.created_at ASC
  LIMIT 1
)
UPDATE chambers c
SET routing_role = 'main'
FROM oldest o
WHERE c.id = o.id
  AND NOT EXISTS (SELECT 1 FROM main_exists);

-- Demote duplicate mains (keep earliest by created_at).
WITH city_hall AS (
  SELECT ch.id AS building_object_id
  FROM office_objects ch
  WHERE ch.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    AND ch.object_type = 'room'
    AND TRIM(ch.label) = 'City Hall'
  LIMIT 1
),
ranked AS (
  SELECT c.id,
         ROW_NUMBER() OVER (ORDER BY c.created_at ASC) AS rn
  FROM chambers c
  INNER JOIN city_hall ch ON c.building_object_id = ch.building_object_id
  WHERE c.routing_role = 'main'
)
UPDATE chambers c
SET routing_role = NULL
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- 3. Chamber «Совет города» (routing_role = NULL, slug city-council)
-- ---------------------------------------------------------------------------

WITH city_hall AS (
  SELECT COALESCE(
    (
      SELECT c.building_object_id
      FROM chambers c
      INNER JOIN office_objects o ON o.id = c.building_object_id
      WHERE c.routing_role = 'main'
        AND o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        AND o.object_type = 'room'
        AND TRIM(o.label) = 'City Hall'
      LIMIT 1
    ),
    (
      SELECT o.id
      FROM office_objects o
      WHERE o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        AND o.object_type = 'room'
        AND TRIM(o.label) = 'City Hall'
      ORDER BY o.created_at ASC
      LIMIT 1
    )
  ) AS id
)
INSERT INTO entity_registry (id, entity_type, name, slug, parent_entity_id)
SELECT
  'c2000000-0000-4000-8000-000000000001',
  'chamber',
  'Совет города',
  'city-council',
  ch.id
FROM city_hall ch
WHERE ch.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entity_registry er WHERE er.id = 'c2000000-0000-4000-8000-000000000001'
  );

WITH city_hall AS (
  SELECT COALESCE(
    (
      SELECT c.building_object_id
      FROM chambers c
      INNER JOIN office_objects o ON o.id = c.building_object_id
      WHERE c.routing_role = 'main'
        AND o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        AND o.object_type = 'room'
        AND TRIM(o.label) = 'City Hall'
      LIMIT 1
    ),
    (
      SELECT o.id
      FROM office_objects o
      WHERE o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        AND o.object_type = 'room'
        AND TRIM(o.label) = 'City Hall'
      ORDER BY o.created_at ASC
      LIMIT 1
    )
  ) AS id
)
INSERT INTO chambers (
  id,
  entity_registry_id,
  building_entity_id,
  building_object_id,
  name,
  x,
  z,
  width,
  depth,
  routing_role
)
SELECT
  'c2000001-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  ch.id,
  ch.id,
  'Совет города',
  4,
  2,
  2.5,
  2,
  NULL
FROM city_hall ch
WHERE ch.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM chambers c WHERE c.id = 'c2000001-0000-4000-8000-000000000001'
  );

-- Council roster: free / cheap / mid / premium (Groq, OR-Qwen, DeepSeek, Mistral, GPT).
INSERT INTO agent_assignments (agent_id, chamber_id, role)
SELECT v.agent_id, 'c2000001-0000-4000-8000-000000000001', v.role
FROM (
  VALUES
    ('a1000005-0000-4000-8000-000000000005'::uuid, 'advisor'),
    ('a1000006-0000-4000-8000-000000000006'::uuid, 'advisor'),
    ('a1000004-0000-4000-8000-000000000004'::uuid, 'advisor'),
    ('a100000b-0000-4000-8000-00000000000b'::uuid, 'advisor'),
    ('a1000002-0000-4000-8000-000000000002'::uuid, 'advisor')
) AS v(agent_id, role)
WHERE EXISTS (
  SELECT 1 FROM chambers c WHERE c.id = 'c2000001-0000-4000-8000-000000000001'
)
ON CONFLICT (agent_id, chamber_id) DO NOTHING;

-- Explicitly keep council routing_role NULL (never main).
UPDATE chambers
SET routing_role = NULL
WHERE id = 'c2000001-0000-4000-8000-000000000001';
