import { parseOpenAIError } from "./api-types";
import { callWithModelFallback } from "./provider-failover";
import { recordProviderFailure, recordProviderSuccess } from "./provider-failover-status";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/** Cheap service LLM default (catalog-verified). */
export const OPENAI_PRIMARY_MODEL = "gpt-4o-mini";

export const OPENAI_FALLBACK_POOL: readonly string[] = ["gpt-4o-mini-2024-07-18"] as const;

export type OpenAICallOpts = {
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "json" | "text";
};

function isRetryableOpenAIFailure(status: number, message: string): boolean {
  if (status === 429 || status === 404 || status === 502 || status === 503) return true;
  return /rate.?limit|unavailable|overloaded|capacity|quota|timeout/i.test(message);
}

async function callOpenAIOnce(
  apiKey: string,
  model: string,
  prompt: string,
  opts: OpenAICallOpts = {},
): Promise<{ ok: boolean; status: number; answer?: string; error?: string }> {
  const userContent =
    opts.responseFormat === "json" && !/\bjson\b/i.test(prompt)
      ? `${prompt}\n\nRespond with valid json.`
      : prompt;

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 2048,
    messages: [{ role: "user", content: userContent }],
  };
  if (opts.temperature !== undefined) {
    body.temperature = opts.temperature;
  }
  if (opts.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: parseOpenAIError(response.status, data),
    };
  }

  const answer = (
    data as { choices?: Array<{ message?: { content?: string | null } }> }
  ).choices?.[0]?.message?.content?.trim();
  if (!answer) {
    return { ok: false, status: 502, error: "OpenAI returned empty answer" };
  }

  return { ok: true, status: response.status, answer };
}

/** Try primary OpenAI model, then OPENAI_FALLBACK_POOL. */
export async function callOpenAIWithFallback(
  primaryModel: string,
  prompt: string,
  opts?: OpenAICallOpts,
): Promise<{ answer: string; modelUsed: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  try {
    const result = await callWithModelFallback({
      providerTag: "openai",
      primaryModel,
      fallbackPool: OPENAI_FALLBACK_POOL,
      isRetryable: isRetryableOpenAIFailure,
      callOnce: (model) => callOpenAIOnce(apiKey, model, prompt, opts),
    });
    recordProviderSuccess("openai", primaryModel, result.modelUsed);
    return result;
  } catch (err) {
    recordProviderFailure(
      "openai",
      primaryModel,
      err instanceof Error ? err.message : "OpenAI failed",
    );
    throw err;
  }
}
