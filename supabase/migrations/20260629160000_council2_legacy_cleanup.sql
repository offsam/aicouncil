-- COUNCIL-2: Remove legacy «Совет города» seed artifacts (not a system entity).
-- FK-safe order: connection → assignments → chamber → entity_registry.
-- Idempotent: DELETE … WHERE id = fixed UUID (no error when rows already absent).

-- 1. City Hall main → legacy council cable
--    connection_permissions + connection_logs: ON DELETE CASCADE from connections.id
DELETE FROM connections
WHERE id = 'c3000000-0000-4000-8000-000000000001';

-- 2. Legacy council roster (5 seed agents)
--    FK: agent_assignments.chamber_id → chambers.id ON DELETE CASCADE
DELETE FROM agent_assignments
WHERE chamber_id = 'c2000001-0000-4000-8000-000000000001';

-- 3. Legacy council chamber row
--    FK: agent_debates.debate_chamber_id → chambers.id ON DELETE CASCADE
--    FK: chambers.entity_registry_id → entity_registry.id ON DELETE CASCADE (inverse: chamber blocks er delete until removed)
DELETE FROM chambers
WHERE id = 'c2000001-0000-4000-8000-000000000001';

-- 4. Legacy council entity_registry row
--    FK: connections.source/target → entity_registry ON DELETE CASCADE (already cleared)
--    FK: chamber_archive, knowledge, rules, routing_logs, agent_debates.caller_entity_id → CASCADE
DELETE FROM entity_registry
WHERE id = 'c2000000-0000-4000-8000-000000000001';
