-- Sprint 1: Mayor → Building → Main Chamber routing

-- 1. Add routing_role to chambers
ALTER TABLE chambers ADD COLUMN IF NOT EXISTS routing_role TEXT DEFAULT NULL;

-- Index: fast lookup of main chamber per building
CREATE INDEX IF NOT EXISTS idx_chambers_building_routing_role
  ON chambers (building_entity_id, routing_role)
  WHERE routing_role IS NOT NULL;

-- 2. Extend routing_logs with RoutingDecision fields
ALTER TABLE routing_logs
  ADD COLUMN IF NOT EXISTS routing_action      TEXT,
  ADD COLUMN IF NOT EXISTS routing_matched_by  TEXT,
  ADD COLUMN IF NOT EXISTS routing_confidence  NUMERIC,
  ADD COLUMN IF NOT EXISTS routing_reasoning   TEXT,
  ADD COLUMN IF NOT EXISTS routing_trace       JSONB,
  ADD COLUMN IF NOT EXISTS delegated_building_id TEXT,
  ADD COLUMN IF NOT EXISTS delegated_chamber_id  TEXT,
  ADD COLUMN IF NOT EXISTS delegated_agent_id    TEXT,
  ADD COLUMN IF NOT EXISTS delegated_answer      TEXT,
  ADD COLUMN IF NOT EXISTS summary_applied       BOOLEAN DEFAULT FALSE;
