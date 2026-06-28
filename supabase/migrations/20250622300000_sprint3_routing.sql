-- Migration: Sprint 3 Task Routing

-- 1. Добавление стоимостных категорий к агентам
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cost_tier TEXT NOT NULL DEFAULT 'cheap' CHECK (cost_tier IN ('free', 'cheap', 'expensive'));

-- Обновление cost_tier для существующих 11 агентов
UPDATE agents SET cost_tier = 'expensive' WHERE id IN ('a1000001-0000-4000-8000-000000000001', 'a1000002-0000-4000-8000-000000000002');
UPDATE agents SET cost_tier = 'cheap' WHERE id = 'a100000b-0000-4000-8000-00000000000b';
UPDATE agents SET cost_tier = 'free' WHERE id IN (
  'a1000003-0000-4000-8000-000000000003',
  'a1000004-0000-4000-8000-000000000004',
  'a1000005-0000-4000-8000-000000000005',
  'a1000006-0000-4000-8000-000000000006',
  'a1000007-0000-4000-8000-000000000007',
  'a1000008-0000-4000-8000-000000000008',
  'a1000009-0000-4000-8000-000000000009',
  'a100000a-0000-4000-8000-00000000000a'
);

-- 2. Добавление описаний маршрутизации к реестру
ALTER TABLE entity_registry ADD COLUMN IF NOT EXISTS routing_description TEXT;

-- 3. Создание таблицы routing_rules
CREATE TABLE IF NOT EXISTS routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_type TEXT NOT NULL CHECK (condition_type IN ('file_extension', 'keyword', 'length_threshold', 'explicit_entity')),
  condition_value TEXT NOT NULL,
  target_entity_registry_id UUID NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Создание таблицы routing_logs
CREATE TABLE IF NOT EXISTS routing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_text TEXT NOT NULL,
  chosen_target_entity_registry_id UUID REFERENCES entity_registry(id) ON DELETE SET NULL,
  all_candidates JSONB,
  method TEXT NOT NULL,
  agent_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Включение RLS
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_logs ENABLE ROW LEVEL SECURITY;

-- 6. Создание General Intake fallback и backfill описаний
-- Создаем General Intake в реестре как прямого ребенка City (AI Council)
INSERT INTO entity_registry (id, entity_type, name, slug, parent_entity_id, routing_description)
VALUES (
  'c0000000-0000-4000-8000-000000000000',
  'chamber',
  'General Intake',
  'general-intake',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479', -- AI Council City ID
  'Обрабатывает запросы, которые не относятся к конкретному отделу: общие вопросы, разговор, неопределённые задачи'
) ON CONFLICT (id) DO UPDATE 
  SET parent_entity_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      routing_description = EXCLUDED.routing_description;

-- Добавляем описание для AI Council City
UPDATE entity_registry SET routing_description = 'Мэрия города AI Council: обрабатывает верхнеуровневые вопросы градостроительства, законов и координации советов.' WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- 7. Очистка устаревших тестовых записей из Sprint 1 и старых привязок General Intake к chambers
-- Удаляем из chambers привязки к General Intake, если они были созданы ранее
DELETE FROM chambers WHERE id = 'c0000000-0000-4000-8000-000000000001' OR entity_registry_id = 'c0000000-0000-4000-8000-000000000000';

-- Удаляем из таблиц правил/знаний тестовые данные Sprint 1
DELETE FROM rules WHERE entity_id IN ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555');
DELETE FROM knowledge WHERE entity_id IN ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555');

-- Удаляем из chambers тестовую геометрию
DELETE FROM chambers WHERE id = '77777777-7777-7777-7777-777777777777' OR entity_registry_id = '55555555-5555-5555-5555-555555555555';

-- Удаляем из реестра тестовые записи
DELETE FROM entity_registry WHERE id IN ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111');
