import type { AgentDefinition } from "./agents";
import { callWithModelFallback } from "./provider-failover";
import { recordProviderFailure, recordProviderSuccess } from "./provider-failover-status";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Verified working :free models (2026-06-24 probe). Order = fallback priority. */
export const OPENROUTER_FREE_FALLBACK_POOL: readonly string[] = [
  "openai/gpt-oss-120b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "liquid/lfm-2.5-1.2b-instruct:free",
  "openai/gpt-oss-20b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "qwen/qwen3-coder:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-nano-9b-v2:free",
] as const;

/** Primary :free model per agent slug (registry identity unchanged). */
export const OPENROUTER_MODEL_BY_SLUG: Record<string, string> = {
  "or-qwen": "openai/gpt-oss-120b:free",
  "or-llama": "google/gemma-4-31b-it:free",
  "or-deepseek-r1": "nvidia/nemotron-3-nano-30b-a3b:free",
  "or-gemma": "google/gemma-4-31b-it:free",
  "or-mistral": "liquid/lfm-2.5-1.2b-instruct:free",
};

export const OPENROUTER_FREE_AGENTS: AgentDefinition[] = [
  {
    id: "or_qwen",
    name: "OR · Qwen 235B",
    shortLabel: "Qw",
    color: "#06b6d4",
    enabled: true,
    openRouterModel: OPENROUTER_MODEL_BY_SLUG["or-qwen"],
  },
  {
    id: "or_llama",
    name: "OR · Llama 3.3",
    shortLabel: "L3",
    color: "#3b82f6",
    enabled: true,
    openRouterModel: OPENROUTER_MODEL_BY_SLUG["or-llama"],
  },
  {
    id: "or_deepseek",
    name: "OR · DeepSeek R1",
    shortLabel: "R1",
    color: "#6366f1",
    enabled: true,
    openRouterModel: OPENROUTER_MODEL_BY_SLUG["or-deepseek-r1"],
  },
  {
    id: "or_gemma",
    name: "OR · Gemma 3",
    shortLabel: "Ge",
    color: "#22c55e",
    enabled: true,
    openRouterModel: OPENROUTER_MODEL_BY_SLUG["or-gemma"],
  },
  {
    id: "or_mistral",
    name: "OR · Mistral",
    shortLabel: "Mf",
    color: "#f97316",
    enabled: true,
    openRouterModel: OPENROUTER_MODEL_BY_SLUG["or-mistral"],
  },
];

export const ALLOWED_FREE_MODELS = [
  ...new Set([
    ...OPENROUTER_FREE_AGENTS.map((a) => a.openRouterModel!),
    ...OPENROUTER_FREE_FALLBACK_POOL,
  ]),
];

export function isAllowedFreeModel(model: string): boolean {
  return model.endsWith(":free") && ALLOWED_FREE_MODELS.includes(model);
}

export function getOpenRouterModelForSlug(slug: string): string | undefined {
  return OPENROUTER_MODEL_BY_SLUG[slug.toLowerCase()];
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function extractAnswer(data: {
  choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
}): string {
  const msg = data.choices?.[0]?.message;
  if (!msg) return "";
  const content = msg.content?.trim();
  if (content) return content;
  const reasoning = msg.reasoning?.trim();
  if (reasoning) return reasoning;
  return "";
}

function isRetryableOpenRouterFailure(status: number, message: string): boolean {
  if (status === 429 || status === 404 || status === 502 || status === 503) return true;
  return /unavailable|rate.?limit|Provider returned error|temporarily rate-limited/i.test(
    message,
  );
}

async function callOpenRouterOnce(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<{ ok: boolean; status: number; answer?: string; error?: string }> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "AI Council",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages,
    }),
  });

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data.error?.message || `OpenRouter error ${response.status}`,
    };
  }

  const answer = extractAnswer(data);
  if (!answer) {
    return {
      ok: false,
      status: 502,
      error: "OpenRouter returned empty answer",
    };
  }

  return { ok: true, status: response.status, answer };
}

/**
 * Try primary model, then auto-fallback through OPENROUTER_FREE_FALLBACK_POOL.
 */
export async function callOpenRouterWithFallback(
  primaryModel: string,
  messages: ChatMessage[],
): Promise<{ answer: string; modelUsed: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  try {
    const result = await callWithModelFallback({
      providerTag: "openrouter",
      primaryModel,
      fallbackPool: OPENROUTER_FREE_FALLBACK_POOL,
      isRetryable: isRetryableOpenRouterFailure,
      callOnce: (model) => callOpenRouterOnce(apiKey, model, messages),
    });
    recordProviderSuccess("openrouter", primaryModel, result.modelUsed);
    return result;
  } catch (err) {
    recordProviderFailure(
      "openrouter",
      primaryModel,
      err instanceof Error ? err.message : "OpenRouter failed",
    );
    throw err;
  }
}
