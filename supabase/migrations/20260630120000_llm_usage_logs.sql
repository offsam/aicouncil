-- USAGE-LOG-1: per-call LLM token usage from provider responses.

CREATE TABLE llm_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  raw_usage JSONB,
  conversation_id TEXT,
  routing_log_id UUID REFERENCES routing_logs(id) ON DELETE SET NULL,
  execution_mode TEXT,
  is_retry BOOLEAN NOT NULL DEFAULT false,
  is_fallback BOOLEAN NOT NULL DEFAULT false,
  attempt_index INTEGER,
  error TEXT
);

CREATE INDEX idx_llm_usage_logs_created_at ON llm_usage_logs (created_at DESC);
CREATE INDEX idx_llm_usage_logs_conversation_id ON llm_usage_logs (conversation_id)
  WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_llm_usage_logs_purpose ON llm_usage_logs (purpose);
CREATE INDEX idx_llm_usage_logs_routing_log_id ON llm_usage_logs (routing_log_id)
  WHERE routing_log_id IS NOT NULL;

ALTER TABLE llm_usage_logs ENABLE ROW LEVEL SECURITY;
