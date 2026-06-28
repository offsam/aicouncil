-- Migration: Sprint 2 buildContext integration

-- 1. Add entity_registry_id to knowledge and rules
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS entity_registry_id UUID REFERENCES entity_registry(id) ON DELETE CASCADE;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS entity_registry_id UUID REFERENCES entity_registry(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_knowledge_entity_registry ON knowledge (entity_registry_id);
CREATE INDEX IF NOT EXISTS idx_rules_entity_registry ON rules (entity_registry_id);

-- 2. Backfill existing entity_registry_id based on entity_type + entity_id
UPDATE knowledge k
SET entity_registry_id = e.id
FROM entity_registry e
WHERE e.entity_type = k.entity_type AND e.id = k.entity_id
AND k.entity_registry_id IS NULL;

UPDATE rules r
SET entity_registry_id = e.id
FROM entity_registry e
WHERE e.entity_type = r.entity_type AND e.id = r.entity_id
AND r.entity_registry_id IS NULL;
