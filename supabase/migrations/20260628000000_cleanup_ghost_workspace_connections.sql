-- Remove ghost/invisible workspace connections:
-- 1) duplicate active pairs (keep oldest)
-- 2) nested chamber → parent building (invisible in-shell jacks)

-- Deactivate duplicate active cables between the same endpoints (keep oldest).
UPDATE connections c
SET is_active = false
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY source_entity_id, target_entity_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM connections
  WHERE is_active = true
) ranked
WHERE c.id = ranked.id
  AND ranked.rn > 1;

-- Deactivate chamber → its parent building (nested; no visible inter-node cable).
UPDATE connections c
SET is_active = false
FROM chambers ch
WHERE c.is_active = true
  AND c.source_entity_id = ch.entity_registry_id
  AND c.target_entity_id = ch.building_object_id;

UPDATE connections c
SET is_active = false
FROM chambers ch
WHERE c.is_active = true
  AND c.source_entity_id = ch.entity_registry_id
  AND c.target_entity_id = ch.building_entity_id
  AND ch.building_entity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS connections_unique_active_pair_idx
  ON connections (source_entity_id, target_entity_id)
  WHERE is_active = true;
