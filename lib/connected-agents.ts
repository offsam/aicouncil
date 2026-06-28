import { AGENT_DB_IDS } from "./ai-council-ids";
import { FLOOR_AGENTS } from "./floor-agents";
import type { AgentRow, AgentStatus } from "./office-types";

const PROVIDER_BY_ENV: Record<string, string> = {
  ANTHROPIC_API_KEY: "anthropic",
  OPENAI_API_KEY: "openai",
  GOOGLE_API_KEY: "google",
  DEEPSEEK_API_KEY: "deepseek",
  GROQ_API_KEY: "groq",
  OPENROUTER_API_KEY: "openrouter",
};

function isEnvConnected(envVar: string): boolean {
  return Boolean(process.env[envVar]?.trim());
}

/** Локальный список агентов с API-подключением (без Supabase) */
export function buildLocalConnectedAgents(): AgentRow[] {
  const now = new Date().toISOString();
  return FLOOR_AGENTS.map((agent) => {
    const online = isEnvConnected(agent.envVar);
    return {
      id: AGENT_DB_IDS[agent.id] ?? agent.id,
      office_id: null,
      name: agent.name,
      provider: PROVIDER_BY_ENV[agent.envVar] ?? "unknown",
      model_id: agent.id,
      status: (online ? "online" : "offline") as AgentStatus,
      created_at: now,
    };
  }).filter((a) => a.status === "online");
}
