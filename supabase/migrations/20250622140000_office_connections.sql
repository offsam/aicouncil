-- Data cables between agents in an office

CREATE TABLE office_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  from_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_agent_id <> to_agent_id),
  UNIQUE (office_id, from_agent_id, to_agent_id)
);

CREATE INDEX idx_office_connections_office_id ON office_connections(office_id);

ALTER TABLE office_connections ENABLE ROW LEVEL SECURITY;
