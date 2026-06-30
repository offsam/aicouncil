-- RTP-1: observability for execution_mode + direct agent chat logging

ALTER TABLE routing_logs
  ADD COLUMN IF NOT EXISTS execution_mode TEXT,
  ADD COLUMN IF NOT EXISTS direct_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS direct_target_entity_id TEXT;

COMMENT ON COLUMN routing_logs.execution_mode IS 'fast | team | council — how the task was executed';
COMMENT ON COLUMN routing_logs.direct_agent_id IS 'Direct agent chat: target agent registry id (not Mayor delegation)';
COMMENT ON COLUMN routing_logs.direct_target_entity_id IS 'Direct agent chat: target chamber registry id (not Mayor delegation)';
