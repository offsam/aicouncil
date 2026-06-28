-- Кабели от главного офиса (hub) к помещениям-офисам на рабочей площадке

CREATE TABLE office_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  to_room_id UUID NOT NULL REFERENCES office_objects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (office_id, to_room_id)
);

CREATE INDEX idx_office_links_office_id ON office_links(office_id);

ALTER TABLE office_links ENABLE ROW LEVEL SECURITY;
