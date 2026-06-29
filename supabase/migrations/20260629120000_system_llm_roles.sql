-- LLM-ROLES-1A: per-office service LLM role config (planner / router / summary).

CREATE TABLE IF NOT EXISTS system_llm_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('planner', 'router', 'summary')),
  primary_provider TEXT NOT NULL CHECK (primary_provider IN ('groq', 'gemini')),
  primary_model TEXT NOT NULL,
  fallback_provider TEXT NOT NULL CHECK (fallback_provider IN ('groq', 'gemini')),
  fallback_model TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (office_id, role)
);

CREATE INDEX IF NOT EXISTS idx_system_llm_roles_office_id ON system_llm_roles (office_id);

-- Default rows: Groq primary, Gemini fallback — matches pre-1A invokeCheapLLM hardcode.
INSERT INTO system_llm_roles (
  office_id,
  role,
  primary_provider,
  primary_model,
  fallback_provider,
  fallback_model,
  updated_at
)
SELECT
  o.id,
  r.role,
  'groq',
  'llama-3.3-70b-versatile',
  'gemini',
  'gemini-2.5-flash',
  now()
FROM offices o
CROSS JOIN (
  VALUES ('planner'::text), ('router'), ('summary')
) AS r(role)
ON CONFLICT (office_id, role) DO NOTHING;
