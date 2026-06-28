export interface FloorAgentDefinition {
  id: string;
  name: string;
  color: string;
  /** Имя переменной окружения для проверки online */
  envVar: string;
  position: [number, number, number];
}

/** 11 агентов в офисе AI Council */
export const FLOOR_AGENTS: FloorAgentDefinition[] = [
  {
    id: "claude",
    name: "Claude",
    color: "#d97706",
    envVar: "ANTHROPIC_API_KEY",
    position: [-4.5, 0, -2.5],
  },
  {
    id: "gpt",
    name: "GPT",
    color: "#10b981",
    envVar: "OPENAI_API_KEY",
    position: [-1.5, 0, -2.5],
  },
  {
    id: "gemini",
    name: "Gemini",
    color: "#4285f4",
    envVar: "GOOGLE_API_KEY",
    position: [1.5, 0, -2.5],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    color: "#4d6bfe",
    envVar: "DEEPSEEK_API_KEY",
    position: [4.5, 0, -2.5],
  },
  {
    id: "groq",
    name: "Groq",
    color: "#f55036",
    envVar: "GROQ_API_KEY",
    position: [-4.5, 0, 0.5],
  },
  {
    id: "or_qwen",
    name: "OR-Qwen",
    color: "#06b6d4",
    envVar: "OPENROUTER_API_KEY",
    position: [-1.5, 0, 0.5],
  },
  {
    id: "or_llama",
    name: "OR-Llama",
    color: "#3b82f6",
    envVar: "OPENROUTER_API_KEY",
    position: [1.5, 0, 0.5],
  },
  {
    id: "or_deepseek",
    name: "OR-DeepSeek-R1",
    color: "#6366f1",
    envVar: "OPENROUTER_API_KEY",
    position: [4.5, 0, 0.5],
  },
  {
    id: "or_gemma",
    name: "OR-Gemma",
    color: "#22c55e",
    envVar: "OPENROUTER_API_KEY",
    position: [-3, 0, 3],
  },
  {
    id: "or_mistral",
    name: "OR-Mistral",
    color: "#f97316",
    envVar: "OPENROUTER_API_KEY",
    position: [0, 0, 3],
  },
  {
    id: "mistral",
    name: "Mistral",
    color: "#ff7000",
    envVar: "OPENROUTER_API_KEY",
    position: [3, 0, 3],
  },
];

export function getAgentOnlineStatus(): Record<string, boolean> {
  const status: Record<string, boolean> = {};
  for (const agent of FLOOR_AGENTS) {
    status[agent.id] = Boolean(process.env[agent.envVar]?.trim());
  }
  return status;
}
