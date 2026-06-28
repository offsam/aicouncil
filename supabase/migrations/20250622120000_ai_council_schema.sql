-- AI Council office schema for 3D floor + Mission Control logging

CREATE TABLE offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rules TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID REFERENCES offices(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline'
    CHECK (status IN ('online', 'offline', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  response TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('success', 'error', 'pending')),
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_office_id ON agents(office_id);
CREATE INDEX idx_request_logs_office_id ON request_logs(office_id);
CREATE INDEX idx_request_logs_agent_id ON request_logs(agent_id);
CREATE INDEX idx_request_logs_created_at ON request_logs(created_at DESC);
CREATE INDEX idx_knowledge_base_office_id ON knowledge_base(office_id);

ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Fixed UUIDs for stable app ↔ DB mapping
INSERT INTO offices (id, name, rules, created_at) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'AI Council',
  E'Правила работы AI Council:\n- Отвечайте на основе фактов и указывайте неопределённость\n- Не выдумывайте источники\n- Кратко формулируйте выводы',
  now()
);

INSERT INTO agents (id, office_id, name, provider, model_id, status) VALUES
  ('a1000001-0000-4000-8000-000000000001', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Claude',           'anthropic',  'claude-sonnet-4-6',                              'offline'),
  ('a1000002-0000-4000-8000-000000000002', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'GPT',              'openai',     'gpt-4o',                                         'offline'),
  ('a1000003-0000-4000-8000-000000000003', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Gemini',           'google',     'gemini-2.0-flash',                               'offline'),
  ('a1000004-0000-4000-8000-000000000004', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'DeepSeek',         'deepseek',   'deepseek-chat',                                  'offline'),
  ('a1000005-0000-4000-8000-000000000005', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Groq',             'groq',       'llama-3.3-70b-versatile',                        'offline'),
  ('a1000006-0000-4000-8000-000000000006', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'OR-Qwen',          'openrouter', 'qwen/qwen3-235b-a22b:free',                      'offline'),
  ('a1000007-0000-4000-8000-000000000007', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'OR-Llama',         'openrouter', 'meta-llama/llama-3.3-70b-instruct:free',         'offline'),
  ('a1000008-0000-4000-8000-000000000008', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'OR-DeepSeek-R1',   'openrouter', 'deepseek/deepseek-r1:free',                      'offline'),
  ('a1000009-0000-4000-8000-000000000009', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'OR-Gemma',         'openrouter', 'google/gemma-3-27b-it:free',                     'offline'),
  ('a100000a-0000-4000-8000-00000000000a', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'OR-Mistral',       'openrouter', 'mistralai/mistral-small-3.1-24b-instruct:free',  'offline'),
  ('a100000b-0000-4000-8000-00000000000b', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Mistral',          'openrouter', 'mistralai/mistral-small-3.1-24b-instruct',       'offline');
