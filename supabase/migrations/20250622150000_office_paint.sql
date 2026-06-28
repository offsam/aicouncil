-- Custom colors for office scene and objects

ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS scene_paint JSONB NOT NULL DEFAULT '{"floorInner":"stone","floorOuter":"cream","edge":"stone"}'::jsonb;

ALTER TABLE office_objects
  ADD COLUMN IF NOT EXISTS color TEXT;
