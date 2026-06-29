-- City Hall main chamber (Си-отец) → internal «Совет города» for Manager delegation (send_tasks).

INSERT INTO connections (id, source_entity_id, target_entity_id, priority, is_active)
SELECT
  'c3000000-0000-4000-8000-000000000001',
  main_ch.entity_registry_id,
  'c2000000-0000-4000-8000-000000000001',
  10,
  true
FROM chambers main_ch
INNER JOIN office_objects o ON o.id = main_ch.building_object_id
WHERE main_ch.routing_role = 'main'
  AND o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  AND o.object_type = 'room'
  AND TRIM(o.label) = 'City Hall'
  AND NOT EXISTS (
    SELECT 1
    FROM connections c
    WHERE c.source_entity_id = main_ch.entity_registry_id
      AND c.target_entity_id = 'c2000000-0000-4000-8000-000000000001'
      AND c.is_active = true
  );

UPDATE connections c
SET is_active = true
WHERE c.id = 'c3000000-0000-4000-8000-000000000001';

INSERT INTO connection_permissions (
  connection_id,
  read_knowledge,
  read_rules,
  read_results,
  send_tasks
)
SELECT
  c.id,
  true,
  true,
  true,
  true
FROM connections c
WHERE c.id = 'c3000000-0000-4000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM connection_permissions cp WHERE cp.connection_id = c.id
  );

UPDATE connection_permissions cp
SET
  read_knowledge = true,
  read_rules = true,
  read_results = true,
  send_tasks = true
WHERE cp.connection_id = 'c3000000-0000-4000-8000-000000000001';
