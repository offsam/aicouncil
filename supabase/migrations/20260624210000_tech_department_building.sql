-- Tech Department building (monitoring) — idempotent seed for workspace canvas.
-- Uses fixed UUID so re-run is safe.
-- Position near other city buildings (same cluster as City Hall / Юристы).

INSERT INTO office_objects (
  id,
  office_id,
  object_type,
  position_x,
  position_z,
  size_w,
  size_d,
  label,
  color
)
SELECT
  'a1000000-0000-4000-8000-000000000001',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'room',
  -40,
  -124,
  20,
  17,
  'Технический отдел',
  'violet'
WHERE NOT EXISTS (
  SELECT 1 FROM office_objects WHERE id = 'a1000000-0000-4000-8000-000000000001'
);

-- If row existed from an earlier seed with wrong coords, move it into the city cluster.
UPDATE office_objects
SET
  position_x = -40,
  position_z = -124,
  size_w = 20,
  size_d = 17,
  label = 'Технический отдел',
  color = COALESCE(color, 'violet')
WHERE id = 'a1000000-0000-4000-8000-000000000001';

INSERT INTO entity_registry (id, entity_type, name, slug, parent_entity_id)
SELECT
  'a1000000-0000-4000-8000-000000000001',
  'building',
  'Технический отдел',
  'tech-department',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479'
WHERE NOT EXISTS (
  SELECT 1 FROM entity_registry WHERE id = 'a1000000-0000-4000-8000-000000000001'
);

-- Monitoring is rendered on the building tile; no inner chamber on canvas.
