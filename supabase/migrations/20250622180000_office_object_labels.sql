-- Custom display name for room offices (3D label above the floor zone)

ALTER TABLE office_objects
  ADD COLUMN IF NOT EXISTS label TEXT;
