CREATE INDEX IF NOT EXISTS idx_request_logs_agent_created
  ON request_logs (agent_id, created_at DESC);
