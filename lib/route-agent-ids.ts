import { selectAgentsForChamberEntity } from "./agent-selection";

const GENERAL_INTAKE_ID = "c0000000-0000-4000-8000-000000000000";

const DB_SLUG_TO_FRONTEND_ID: Record<string, string> = {
  claude: "claude",
  gpt: "gpt",
  gemini: "gemini",
  deepseek: "deepseek",
  groq: "grok",
  "or-qwen": "or_qwen",
  "or-llama": "or_llama",
  "or-deepseek-r1": "or_deepseek",
  "or-gemma": "or_gemma",
  "or-mistral": "or_mistral",
  mistral: "mistral",
};

/** Map entity_registry slug → frontend / request_logs slug. */
export function registrySlugToFrontendId(slug: string): string {
  return DB_SLUG_TO_FRONTEND_ID[slug] ?? slug.replace(/-/g, "_");
}

/** Resolve frontend agent ids for a route target (same logic as /api/route). */
export async function resolveAgentIdsForTarget(
  chosenTargetId: string,
): Promise<string[]> {
  const roster = await selectAgentsForChamberEntity(chosenTargetId, 0, {
    rosterOnly: true,
  });
  return roster
    .map((agent) => DB_SLUG_TO_FRONTEND_ID[agent.slug] ?? agent.slug.replace(/-/g, "_"))
    .filter((id): id is string => Boolean(id));
}

export { GENERAL_INTAKE_ID };
