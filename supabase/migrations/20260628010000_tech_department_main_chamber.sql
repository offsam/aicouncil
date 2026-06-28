-- Tech Department: main chamber (Manager) + coder agents for diagnostics / structure ops.
-- Reuses registry id a1000000-0000-4000-8000-000000000002 (removed with old monitoring chamber).

INSERT INTO entity_registry (id, entity_type, name, slug, parent_entity_id, routing_description)
SELECT
  'a1000000-0000-4000-8000-000000000002',
  'chamber',
  'Технический отдел',
  'tech-department-main',
  'a1000000-0000-4000-8000-000000000001',
  'Главный отдел Технического департамента: диагностика работы системы (роутинг, связи, архив, ошибки) и выполнение структурных команд по подтверждению пользователя.'
WHERE NOT EXISTS (
  SELECT 1 FROM entity_registry WHERE id = 'a1000000-0000-4000-8000-000000000002'
);

UPDATE entity_registry
SET
  name = 'Технический отдел',
  slug = 'tech-department-main',
  parent_entity_id = 'a1000000-0000-4000-8000-000000000001',
  routing_description = 'Главный отдел Технического департамента: диагностика работы системы (роутинг, связи, архив, ошибки) и выполнение структурных команд по подтверждению пользователя.'
WHERE id = 'a1000000-0000-4000-8000-000000000002';

INSERT INTO chambers (
  id,
  entity_registry_id,
  building_entity_id,
  building_object_id,
  name,
  x,
  z,
  width,
  depth,
  routing_role
)
SELECT
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Технический отдел',
  2,
  2,
  6,
  5,
  'main'
WHERE NOT EXISTS (
  SELECT 1 FROM chambers WHERE id = 'a1000000-0000-4000-8000-000000000004'
);

UPDATE chambers
SET
  entity_registry_id = 'a1000000-0000-4000-8000-000000000002',
  building_entity_id = 'a1000000-0000-4000-8000-000000000001',
  building_object_id = 'a1000000-0000-4000-8000-000000000001',
  name = 'Технический отдел',
  routing_role = 'main'
WHERE id = 'a1000000-0000-4000-8000-000000000004';

-- Building routing description for Mayor semantic router.
UPDATE entity_registry
SET routing_description = 'Технический отдел: диагностика работы системы — роутинг, ошибки, fallback-blocked, связи между зданиями/отделами, архив ответов. Сюда направлять вопросы «почему не работает X», «что случилось с Y», «почему завис Z», а также явные команды на создание зданий/отделов/связей/назначение агентов.'
WHERE id = 'a1000000-0000-4000-8000-000000000001';

-- Diagnostic agent rules (injected via buildContext).
INSERT INTO rules (entity_type, entity_id, entity_registry_id, rule_text)
SELECT
  'chamber',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000002',
  'Отвечай только на основе блока [Diagnostic snapshot] в system prompt. Если данных недостаточно — скажи прямо, чего не хватает. Не выдумывай логи, связи или статусы.'
WHERE NOT EXISTS (
  SELECT 1 FROM rules
  WHERE entity_type = 'chamber'
    AND entity_id = 'a1000000-0000-4000-8000-000000000002'
    AND rule_text LIKE 'Отвечай только на основе блока%'
);

-- Coder agents: Groq + DeepSeek.
INSERT INTO agent_assignments (agent_id, chamber_id, role)
SELECT v.agent_id, 'a1000000-0000-4000-8000-000000000004', v.role
FROM (
  VALUES
    ('a1000005-0000-4000-8000-000000000005'::uuid, 'coder'),
    ('a1000004-0000-4000-8000-000000000004'::uuid, 'coder')
) AS v(agent_id, role)
WHERE NOT EXISTS (
  SELECT 1 FROM agent_assignments aa
  WHERE aa.chamber_id = 'a1000000-0000-4000-8000-000000000004'
    AND aa.agent_id = v.agent_id
);
