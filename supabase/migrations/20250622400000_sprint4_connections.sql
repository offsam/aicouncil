-- Migration: Sprint 4 Connections (кабели)

-- 1. Создание таблицы connections
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_self_connection CHECK (source_entity_id <> target_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_source ON connections (source_entity_id);
CREATE INDEX IF NOT EXISTS idx_connections_target ON connections (target_entity_id);

-- 2. Создание таблицы connection_permissions
CREATE TABLE IF NOT EXISTS connection_permissions (
  connection_id UUID PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
  read_knowledge BOOLEAN NOT NULL DEFAULT false,
  read_rules BOOLEAN NOT NULL DEFAULT false,
  read_results BOOLEAN NOT NULL DEFAULT false,
  send_tasks BOOLEAN NOT NULL DEFAULT false
);

-- 3. Создание таблицы connection_logs
CREATE TABLE IF NOT EXISTS connection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  payload_type TEXT NOT NULL CHECK (payload_type IN ('knowledge', 'rules', 'results', 'task')),
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connection_logs_connection ON connection_logs (connection_id);

-- 4. Включение Row Level Security (RLS)
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_logs ENABLE ROW LEVEL SECURITY;

-- 5. Базовые политики RLS (разрешаем всё для простоты интеграции, аналогично остальным таблицам)
CREATE POLICY IF NOT EXISTS "Allow all for connections" ON connections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow all for connection_permissions" ON connection_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow all for connection_logs" ON connection_logs FOR ALL USING (true) WITH CHECK (true);
