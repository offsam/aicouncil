-- Persist user-edited orthogonal cable routes on the workspace canvas
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS route_path JSONB;

COMMENT ON COLUMN connections.route_path IS 'Workspace cable waypoints: { "version": 1, "points": [{ "x": number, "y": number }] }';
