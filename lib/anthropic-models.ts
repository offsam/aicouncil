import { parseAnthropicError } from "./api-types";
import { callWithModelFallback, type UsageLogMeta } from "./provider-failover";
import { recordProviderFailure, recordProviderSuccess } from "./provider-failover-status";
import { extractRawUsage } from "./tokens";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

/** Cheap service LLM default (catalog-verified). */
export const ANTHROPIC_PRIMARY_MODEL = "claude-haiku-4-5-20251001";

export const ANTHROPIC_FALLBACK_POOL: readonly string[] = [] as const;

export type AnthropicCallOpts = {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
};

function isRetryableAnthropicFailure(status: number, message: string): boolean {
  if (status === 429 || status === 404 || status === 502 || status === 503) return true;
  return /rate.?limit|overloaded|unavailable|capacity|quota|timeout/i.test(message);
}

async function callAnthropicOnce(
  apiKey: string,
  model: string,
  prompt: string,
  opts: AnthropicCallOpts = {},
): Promise<{ ok: boolean; status: number; answer?: string; error?: string; rawUsage?: unknown }> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 2048,
    messages: [{ role: "user", content: prompt }],
  };
  if (opts.systemPrompt?.trim()) {
    body.system = opts.systemPrompt.trim();
  }
  if (opts.temperature !== undefined) {
    body.temperature = opts.temperature;
  }

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  const rawUsage = extractRawUsage("anthropic", data);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: parseAnthropicError(response.status, data),
      rawUsage,
    };
  }

  const textBlock = (
    data as { content?: Array<{ type: string; text?: string }> }
  ).content?.find((block) => block.type === "text");
  const answer = textBlock?.text?.trim();
  if (!answer) {
    return { ok: false, status: 502, error: "Anthropic returned empty answer", rawUsage };
  }

  return { ok: true, status: response.status, answer, rawUsage };
}

/** Try primary Anthropic model, then ANTHROPIC_FALLBACK_POOL. */
export async function callAnthropicWithFallback(
  primaryModel: string,
  prompt: string,
  opts?: AnthropicCallOpts & { usageLog?: UsageLogMeta },
): Promise<{ answer: string; modelUsed: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const { usageLog, ...callOpts } = opts ?? {};

  try {
    const result = await callWithModelFallback({
      providerTag: "anthropic",
      primaryModel,
      fallbackPool: ANTHROPIC_FALLBACK_POOL,
      isRetryable: isRetryableAnthropicFailure,
      callOnce: (model) => callAnthropicOnce(apiKey, model, prompt, callOpts),
      usageLog,
    });
    recordProviderSuccess("anthropic", primaryModel, result.modelUsed);
    return result;
  } catch (err) {
    recordProviderFailure(
      "anthropic",
      primaryModel,
      err instanceof Error ? err.message : "Anthropic failed",
    );
    throw err;
  }
}
