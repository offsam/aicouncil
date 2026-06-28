-- Migration: Sprint 1 Entity Hierarchy (city -> building -> chamber -> agent)

-- 1. Create entity_registry
CREATE TABLE entity_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  parent_entity_id UUID REFERENCES entity_registry(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entity_registry_parent ON entity_registry (parent_entity_id);
CREATE UNIQUE INDEX idx_entity_registry_parent_slug ON entity_registry (parent_entity_id, slug);
CREATE UNIQUE INDEX idx_entity_registry_parent_slug_null ON entity_registry (slug) WHERE parent_entity_id IS NULL;

-- 2. Create chambers
CREATE TABLE chambers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_registry_id UUID NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
  building_entity_id UUID NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
  building_object_id UUID REFERENCES office_objects(id) ON DELETE SET NULL,
  manager_agent_id UUID NULL REFERENCES agents(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  x NUMERIC NOT NULL,
  z NUMERIC NOT NULL,
  width NUMERIC NOT NULL,
  depth NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chambers_building ON chambers (building_entity_id);

-- 3. Create universal knowledge table
CREATE TABLE knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  object_id UUID REFERENCES office_objects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_entity ON knowledge (entity_type, entity_id);

-- 4. Create universal rules table
CREATE TABLE rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  object_id UUID REFERENCES office_objects(id) ON DELETE SET NULL,
  rule_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rules_entity ON rules (entity_type, entity_id);

-- 5. Enable RLS (Row Level Security)
ALTER TABLE entity_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE chambers ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;

-- 6. Backfill existing entities
-- 6.1. Backfill cities (from offices)
INSERT INTO entity_registry (id, entity_type, name, slug, parent_entity_id)
SELECT id, 'city', name, COALESCE(NULLIF(LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')), ''), 'city-' || SUBSTRING(id::text FROM 1 FOR 8)), NULL
FROM offices
ON CONFLICT (id) DO NOTHING;

-- 6.2. Backfill buildings (from office_objects of type 'room')
INSERT INTO entity_registry (id, entity_type, name, slug, parent_entity_id)
SELECT id, 'building', COALESCE(label, 'Building ' || SUBSTRING(id::text FROM 1 FOR 8)), COALESCE(NULLIF(LOWER(REGEXP_REPLACE(label, '[^a-zA-Z0-9]+', '-', 'g')), ''), 'building-' || SUBSTRING(id::text FROM 1 FOR 8)), office_id
FROM office_objects
WHERE object_type = 'room'
ON CONFLICT (id) DO NOTHING;

-- 6.3. Backfill agents (from agents)
INSERT INTO entity_registry (id, entity_type, name, slug, parent_entity_id)
SELECT id, 'agent', name, COALESCE(NULLIF(LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')), ''), 'agent-' || SUBSTRING(id::text FROM 1 FOR 8)), office_id
FROM agents
ON CONFLICT (id) DO NOTHING;

-- 6.4. Backfill knowledge entries (from knowledge_base)
INSERT INTO knowledge (id, entity_type, entity_id, object_id, title, content, file_url, created_at)
SELECT id, 'city', office_id, NULL, title, content, NULL, created_at
FROM knowledge_base
ON CONFLICT (id) DO NOTHING;

-- 6.5. Backfill rules (from offices.rules)
INSERT INTO rules (entity_type, entity_id, object_id, rule_text, created_at)
SELECT 'city', id, NULL, rules, created_at
FROM offices
WHERE rules <> ''
ON CONFLICT (id) DO NOTHING;
