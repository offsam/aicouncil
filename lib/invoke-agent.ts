import { buildContext } from "./entity-registry";
import { CHAMBER_ANSWER_SYSTEM_PREFIX } from "./agent-persona";
import { callGeminiWithFallback, GEMINI_PRIMARY_MODEL } from "./gemini-models";
import { callGroqWithFallback, GROQ_PRIMARY_MODEL } from "./groq-models";
import {
  callOpenRouterWithFallback,
  getOpenRouterModelForSlug,
} from "./openrouter-free";

const SLUG_TO_ASK_PATH: Record<string, string> = {
  claude: "/api/ask-claude",
  gpt: "/api/ask-gpt",
  gemini: "/api/ask-gemini",
  deepseek: "/api/ask-deepseek",
  groq: "/api/ask-groq",
  mistral: "/api/ask-mistral",
  "or-qwen": "/api/ask-openrouter",
  "or-llama": "/api/ask-openrouter",
  "or-deepseek-r1": "/api/ask-openrouter",
  "or-gemma": "/api/ask-openrouter",
  "or-mistral": "/api/ask-openrouter",
};

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + "...";
}

async function callGroq(systemPrompt: string, question: string): Promise<string> {
  const messages = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    { role: "user" as const, content: question },
  ];
  const { answer } = await callGroqWithFallback(GROQ_PRIMARY_MODEL, messages);
  return answer;
}

async function callGemini(systemPrompt: string, question: string): Promise<string> {
  const { answer } = await callGeminiWithFallback(GEMINI_PRIMARY_MODEL, {
    parts: [{ text: question }],
    systemPrompt,
  });
  return answer;
}

export type InvokeAgentParams = {
  agentSlug: string;
  agentRegistryId: string;
  chamberRegistryId: string;
  question: string;
  previousStepOutput?: string | null;
  forceError?: boolean;
  /** Prepended before buildContext flattenedPrompt (e.g. role overlay). */
  systemPromptPrefix?: string | null;
};

/**
 * Invoke agent for a workflow step (server-side, same context path as ask-* routes).
 */
export async function invokeAgentForWorkflow(params: InvokeAgentParams): Promise<string> {
  if (params.forceError) {
    throw new Error("Forced workflow step failure (test)");
  }

  const context = await buildContext(params.agentRegistryId, {
    chamberRegistryId: params.chamberRegistryId,
    taskText: params.question,
  });

  let systemPrompt = context.flattenedPrompt;
  const prefixParts: string[] = [CHAMBER_ANSWER_SYSTEM_PREFIX];
  if (params.systemPromptPrefix?.trim()) {
    prefixParts.unshift(params.systemPromptPrefix.trim());
  }
  systemPrompt = `${prefixParts.join("\n\n")}\n\n${systemPrompt}`.trim();
  if (params.previousStepOutput?.trim()) {
    systemPrompt += `\n\n[Previous workflow step output]\n${truncate(params.previousStepOutput, 2000)}`;
  }

  const slug = params.agentSlug.toLowerCase();

  if (slug === "gemini") {
    return callGemini(systemPrompt, params.question);
  }

  if (slug === "groq" || !SLUG_TO_ASK_PATH[slug]) {
    return callGroq(systemPrompt, params.question);
  }

  const openRouterModel = getOpenRouterModelForSlug(slug);
  if (openRouterModel) {
    const messages = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user" as const, content: params.question },
    ];
    const { answer } = await callOpenRouterWithFallback(openRouterModel, messages);
    return answer;
  }

  return callGroq(systemPrompt, params.question);
}

export function summarizeOutput(full: string, max = 200): string {
  return truncate(full, max);
}
