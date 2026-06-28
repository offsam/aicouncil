-- Mayor per-conversation turn memory (Telegram + future channels).
-- Scoped by conversation_id (e.g. telegram:<chat_id>); never mix channels.

CREATE TABLE IF NOT EXISTS mayor_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  kind text NOT NULL DEFAULT 'answer' CHECK (kind IN ('answer', 'clarify')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mayor_conversation_messages_conv_created
  ON mayor_conversation_messages (conversation_id, created_at DESC);

COMMENT ON TABLE mayor_conversation_messages IS
  'Recent Mayor chat turns keyed by channel-scoped conversation_id (e.g. telegram:12345).';
