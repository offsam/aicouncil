-- Phase 1C: Tech Department → City Hall system edge (connection + permissions only).
-- Source: Tech Department building registry id.
-- Target: City Hall building (resolved by label in office_objects).
-- Permissions (revised Option A): read_knowledge=F, read_rules=F, read_results=T, send_tasks=F
-- Escalation authorized by mandatory system edge existence (DR-007), not send_tasks.

-- Connection Tech Dept → City Hall (fixed id for idempotent re-run).
INSERT INTO connections (id, source_entity_id, target_entity_id, priority, is_active)
SELECT
  'c1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  ch.id,
  10,
  true
FROM office_objects ch
WHERE ch.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  AND ch.object_type = 'room'
  AND TRIM(ch.label) = 'City Hall'
  AND NOT EXISTS (
    SELECT 1
    FROM connections c
    WHERE c.source_entity_id = 'a1000000-0000-4000-8000-000000000001'
      AND c.target_entity_id = ch.id
  );

-- Keep target in sync if City Hall building id changed (re-point fixed connection row).
UPDATE connections c
SET target_entity_id = ch.id, is_active = true
FROM office_objects ch
WHERE c.id = 'c1000000-0000-4000-8000-000000000001'
  AND ch.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  AND ch.object_type = 'room'
  AND TRIM(ch.label) = 'City Hall'
  AND c.target_entity_id IS DISTINCT FROM ch.id;

-- Option A permissions on Tech Dept → City Hall link.
UPDATE connection_permissions cp
SET
  read_knowledge = false,
  read_rules = false,
  read_results = true,
  send_tasks = false
FROM connections c
INNER JOIN office_objects ch ON ch.id = c.target_entity_id
WHERE cp.connection_id = c.id
  AND c.source_entity_id = 'a1000000-0000-4000-8000-000000000001'
  AND c.is_active = true
  AND ch.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  AND ch.object_type = 'room'
  AND TRIM(ch.label) = 'City Hall';

INSERT INTO connection_permissions (
  connection_id,
  read_knowledge,
  read_rules,
  read_results,
  send_tasks
)
SELECT
  c.id,
  false,
  false,
  true,
  false
FROM connections c
INNER JOIN office_objects ch ON ch.id = c.target_entity_id
WHERE c.source_entity_id = 'a1000000-0000-4000-8000-000000000001'
  AND c.is_active = true
  AND ch.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  AND ch.object_type = 'room'
  AND TRIM(ch.label) = 'City Hall'
  AND NOT EXISTS (
    SELECT 1 FROM connection_permissions cp WHERE cp.connection_id = c.id
  );
