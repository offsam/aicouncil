import { OPENROUTER_FREE_AGENTS } from "./openrouter-free";

export type AgentId =
  | "claude"
  | "gpt"
  | "gemini"
  | "deepseek"
  | "grok"
  | "mistral"
  | "or_qwen"
  | "or_llama"
  | "or_deepseek"
  | "or_gemma"
  | "or_mistral";

export type AgentStatus = "idle" | "loading" | "done" | "error" | "soon";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  shortLabel: string;
  color: string;
  enabled: boolean;
  /** OpenRouter :free model slug — только бесплатные варианты */
  openRouterModel?: string;
}

const CORE_AGENTS: AgentDefinition[] = [
  {
    id: "claude",
    name: "Claude",
    shortLabel: "Cl",
    color: "#d97706",
    enabled: true,
  },
  {
    id: "gpt",
    name: "GPT",
    shortLabel: "GPT",
    color: "#10b981",
    enabled: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    shortLabel: "Gm",
    color: "#4285f4",
    enabled: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    shortLabel: "DS",
    color: "#4d6bfe",
    enabled: true,
  },
  {
    id: "grok",
    name: "Grok",
    shortLabel: "Gk",
    color: "#e5e5e5",
    enabled: true,
  },
  {
    id: "mistral",
    name: "Mistral",
    shortLabel: "Mi",
    color: "#ff7000",
    enabled: true,
  },
];

export const AGENTS: AgentDefinition[] = [
  ...CORE_AGENTS,
  ...OPENROUTER_FREE_AGENTS,
];
