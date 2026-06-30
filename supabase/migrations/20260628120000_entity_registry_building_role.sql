-- Phase 1C.1: building_role schema (ADR-001 Option B). No backfill — all rows stay NULL until 1C.2.

ALTER TABLE entity_registry
  ADD COLUMN IF NOT EXISTS building_role TEXT NULL;

ALTER TABLE entity_registry
  DROP CONSTRAINT IF EXISTS entity_registry_building_role_check;

ALTER TABLE entity_registry
  ADD CONSTRAINT entity_registry_building_role_check
  CHECK (building_role IS NULL OR building_role IN ('city_hall', 'tech_department'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_registry_building_role_per_office
  ON entity_registry (parent_entity_id, building_role)
  WHERE building_role IS NOT NULL;
