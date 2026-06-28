-- Repair City Hall workspace graph: canonical building, council chamber parent, dedupe cables.

WITH city_hall_candidates AS (
  SELECT
    o.id,
    o.created_at,
    COALESCE(ch_counts.cnt, 0) AS chamber_count
  FROM office_objects o
  LEFT JOIN (
    SELECT building_object_id, COUNT(*) AS cnt
    FROM chambers
    WHERE building_object_id IS NOT NULL
    GROUP BY building_object_id
  ) ch_counts ON ch_counts.building_object_id = o.id
  WHERE o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    AND o.object_type = 'room'
    AND TRIM(o.label) = 'City Hall'
),
canonical AS (
  SELECT id
  FROM city_hall_candidates
  ORDER BY chamber_count DESC, created_at ASC
  LIMIT 1
)
UPDATE chambers c
SET
  building_object_id = canonical.id,
  building_entity_id = canonical.id
FROM canonical
WHERE canonical.id IS NOT NULL
  AND c.building_object_id IN (
    SELECT o.id
    FROM office_objects o
    WHERE o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      AND o.object_type = 'room'
      AND TRIM(o.label) = 'City Hall'
  )
  AND c.building_object_id IS DISTINCT FROM canonical.id;

WITH city_hall_candidates AS (
  SELECT
    o.id,
    o.created_at,
    COALESCE(ch_counts.cnt, 0) AS chamber_count
  FROM office_objects o
  LEFT JOIN (
    SELECT building_object_id, COUNT(*) AS cnt
    FROM chambers
    WHERE building_object_id IS NOT NULL
    GROUP BY building_object_id
  ) ch_counts ON ch_counts.building_object_id = o.id
  WHERE o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    AND o.object_type = 'room'
    AND TRIM(o.label) = 'City Hall'
),
canonical AS (
  SELECT id
  FROM city_hall_candidates
  ORDER BY chamber_count DESC, created_at ASC
  LIMIT 1
)
UPDATE entity_registry er
SET parent_entity_id = canonical.id
FROM canonical
WHERE canonical.id IS NOT NULL
  AND er.entity_type = 'chamber'
  AND er.parent_entity_id IN (
    SELECT o.id
    FROM office_objects o
    WHERE o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      AND o.object_type = 'room'
      AND TRIM(o.label) = 'City Hall'
  )
  AND er.parent_entity_id IS DISTINCT FROM canonical.id;

WITH city_hall_candidates AS (
  SELECT
    o.id,
    o.created_at,
    COALESCE(ch_counts.cnt, 0) AS chamber_count
  FROM office_objects o
  LEFT JOIN (
    SELECT building_object_id, COUNT(*) AS cnt
    FROM chambers
    WHERE building_object_id IS NOT NULL
    GROUP BY building_object_id
  ) ch_counts ON ch_counts.building_object_id = o.id
  WHERE o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    AND o.object_type = 'room'
    AND TRIM(o.label) = 'City Hall'
),
canonical AS (
  SELECT id
  FROM city_hall_candidates
  ORDER BY chamber_count DESC, created_at ASC
  LIMIT 1
)
UPDATE connections c
SET target_entity_id = canonical.id, is_active = true
FROM canonical
WHERE canonical.id IS NOT NULL
  AND c.id = 'c1000000-0000-4000-8000-000000000001'
  AND c.target_entity_id IS DISTINCT FROM canonical.id;

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

-- Deactivate Tech Dept → non-canonical City Hall duplicates.
WITH city_hall_candidates AS (
  SELECT
    o.id,
    o.created_at,
    COALESCE(ch_counts.cnt, 0) AS chamber_count
  FROM office_objects o
  LEFT JOIN (
    SELECT building_object_id, COUNT(*) AS cnt
    FROM chambers
    WHERE building_object_id IS NOT NULL
    GROUP BY building_object_id
  ) ch_counts ON ch_counts.building_object_id = o.id
  WHERE o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    AND o.object_type = 'room'
    AND TRIM(o.label) = 'City Hall'
),
canonical AS (
  SELECT id
  FROM city_hall_candidates
  ORDER BY chamber_count DESC, created_at ASC
  LIMIT 1
)
UPDATE connections c
SET is_active = false
FROM canonical
WHERE canonical.id IS NOT NULL
  AND c.is_active = true
  AND c.source_entity_id = 'a1000000-0000-4000-8000-000000000001'
  AND c.target_entity_id IN (
    SELECT o.id
    FROM office_objects o
    WHERE o.office_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      AND o.object_type = 'room'
      AND TRIM(o.label) = 'City Hall'
  )
  AND c.target_entity_id IS DISTINCT FROM canonical.id;

CREATE UNIQUE INDEX IF NOT EXISTS connections_unique_active_pair_idx
  ON connections (source_entity_id, target_entity_id)
  WHERE is_active = true;
