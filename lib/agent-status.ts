import type { AgentRow, AgentStatus } from "./office-types";

const ENV_BY_PROVIDER: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export function computeAgentStatus(agent: Pick<AgentRow, "provider">): AgentStatus {
  const envVar = ENV_BY_PROVIDER[agent.provider];
  if (!envVar) return "offline";
  return process.env[envVar]?.trim() ? "online" : "offline";
}

export function withComputedStatus<T extends Pick<AgentRow, "provider" | "status">>(
  agent: T,
): T & { status: AgentStatus } {
  return { ...agent, status: computeAgentStatus(agent) };
}
