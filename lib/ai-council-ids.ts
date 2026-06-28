/** Stable IDs from supabase/migrations/20250622120000_ai_council_schema.sql */

export const AI_COUNCIL_OFFICE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

/** App agent slug → Supabase agents.id */
export const AGENT_DB_IDS: Record<string, string> = {
  claude: "a1000001-0000-4000-8000-000000000001",
  gpt: "a1000002-0000-4000-8000-000000000002",
  gemini: "a1000003-0000-4000-8000-000000000003",
  deepseek: "a1000004-0000-4000-8000-000000000004",
  groq: "a1000005-0000-4000-8000-000000000005",
  grok: "a1000005-0000-4000-8000-000000000005",
  or_qwen: "a1000006-0000-4000-8000-000000000006",
  or_llama: "a1000007-0000-4000-8000-000000000007",
  or_deepseek: "a1000008-0000-4000-8000-000000000008",
  or_gemma: "a1000009-0000-4000-8000-000000000009",
  or_mistral: "a100000a-0000-4000-8000-00000000000a",
  mistral: "a100000b-0000-4000-8000-00000000000b",
};

export function resolveAgentDbId(slug: string): string | undefined {
  return AGENT_DB_IDS[slug];
}
