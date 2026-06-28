-- W13: resizable agent nodes on workspace canvas
ALTER TABLE agent_assignments
  ADD COLUMN IF NOT EXISTS layout_size DOUBLE PRECISION;
