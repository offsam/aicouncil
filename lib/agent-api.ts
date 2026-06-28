import type { AgentId } from "./agents";

export const AGENT_API_ROUTES: Partial<Record<AgentId, string>> = {
  claude: "/api/ask-claude",
  gpt: "/api/ask-gpt",
  gemini: "/api/ask-gemini",
  deepseek: "/api/ask-deepseek",
  grok: "/api/ask-groq",
  mistral: "/api/ask-mistral",
  or_qwen: "/api/ask-openrouter",
  or_llama: "/api/ask-openrouter",
  or_deepseek: "/api/ask-openrouter",
  or_gemma: "/api/ask-openrouter",
  or_mistral: "/api/ask-openrouter",
};
