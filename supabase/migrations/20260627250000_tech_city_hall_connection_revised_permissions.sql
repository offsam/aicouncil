-- Phase 1C revised Option A: decouple escalation from send_tasks.
-- Model 1 system edge stays; routing eligibility removed (send_tasks = false).

UPDATE connection_permissions cp
SET
  read_knowledge = false,
  read_rules = false,
  read_results = true,
  send_tasks = false
FROM connections c
WHERE cp.connection_id = c.id
  AND c.id = 'c1000000-0000-4000-8000-000000000001'
  AND c.is_active = true;
