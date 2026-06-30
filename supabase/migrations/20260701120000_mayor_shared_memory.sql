-- MAYOR-MEMORY-1: unified cross-channel Mayor shared summary (one row per office).

CREATE TABLE IF NOT EXISTS mayor_shared_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  memory_scope_id text NOT NULL,
  summary text,
  token_estimate int,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, memory_scope_id)
);

CREATE INDEX IF NOT EXISTS idx_mayor_shared_memory_office
  ON mayor_shared_memory (office_id);

COMMENT ON TABLE mayor_shared_memory IS
  'Cross-channel Mayor project memory — one compact summary per office (Workspace + Telegram).';
