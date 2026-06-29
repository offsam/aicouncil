-- LLM-ROLES default swap: Anthropic Haiku primary, OpenAI GPT-4o-mini fallback (all roles/offices).

ALTER TABLE system_llm_roles
  DROP CONSTRAINT IF EXISTS system_llm_roles_primary_provider_check;

ALTER TABLE system_llm_roles
  DROP CONSTRAINT IF EXISTS system_llm_roles_fallback_provider_check;

ALTER TABLE system_llm_roles
  ADD CONSTRAINT system_llm_roles_primary_provider_check
    CHECK (primary_provider IN ('groq', 'gemini', 'anthropic', 'openai'));

ALTER TABLE system_llm_roles
  ADD CONSTRAINT system_llm_roles_fallback_provider_check
    CHECK (fallback_provider IN ('groq', 'gemini', 'anthropic', 'openai'));

UPDATE system_llm_roles
SET
  primary_provider = 'anthropic',
  primary_model = 'claude-haiku-4-5-20251001',
  fallback_provider = 'openai',
  fallback_model = 'gpt-4o-mini',
  updated_at = now()
WHERE
  primary_provider = 'groq'
  AND primary_model = 'llama-3.3-70b-versatile'
  AND fallback_provider = 'gemini'
  AND fallback_model = 'gemini-2.5-flash';
