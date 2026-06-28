-- W5: local agent position inside chamber on workspace canvas
ALTER TABLE agent_assignments
  ADD COLUMN IF NOT EXISTS layout_x DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS layout_y DOUBLE PRECISION;
