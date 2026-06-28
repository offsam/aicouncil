-- Placed objects on 3D office floor

CREATE TABLE office_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL
    CHECK (object_type IN ('desk', 'wall', 'door', 'cabinet', 'board')),
  position_x DOUBLE PRECISION NOT NULL,
  position_z DOUBLE PRECISION NOT NULL,
  rotation_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_office_objects_office_id ON office_objects(office_id);
CREATE INDEX idx_office_objects_agent_id ON office_objects(agent_id);

ALTER TABLE office_objects ENABLE ROW LEVEL SECURITY;

-- Seed desk placements for AI Council (matches lib/floor-agents.ts layout)
INSERT INTO office_objects (office_id, object_type, position_x, position_z, rotation_y, agent_id) VALUES
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk', -4.5, -2.5, 0, 'a1000001-0000-4000-8000-000000000001'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk', -1.5, -2.5, 0, 'a1000002-0000-4000-8000-000000000002'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk',  1.5, -2.5, 0, 'a1000003-0000-4000-8000-000000000003'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk',  4.5, -2.5, 0, 'a1000004-0000-4000-8000-000000000004'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk', -4.5,  0.5, 0, 'a1000005-0000-4000-8000-000000000005'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk', -1.5,  0.5, 0, 'a1000006-0000-4000-8000-000000000006'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk',  1.5,  0.5, 0, 'a1000007-0000-4000-8000-000000000007'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk',  4.5,  0.5, 0, 'a1000008-0000-4000-8000-000000000008'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk', -3.0,  3.0, 0, 'a1000009-0000-4000-8000-000000000009'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk',  0.0,  3.0, 0, 'a100000a-0000-4000-8000-00000000000a'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'desk',  3.0,  3.0, 0, 'a100000b-0000-4000-8000-00000000000b');
