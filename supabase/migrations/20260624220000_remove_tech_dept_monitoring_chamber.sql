-- Remove decorative monitoring chamber from Tech Department — stats live on the building tile.
DELETE FROM agent_assignments
WHERE chamber_id = 'a1000000-0000-4000-8000-000000000003';

DELETE FROM chambers
WHERE id = 'a1000000-0000-4000-8000-000000000003';

DELETE FROM entity_registry
WHERE id = 'a1000000-0000-4000-8000-000000000002';
