import { callWithModelFallback } from "./provider-failover";
import { recordProviderFailure, recordProviderSuccess } from "./provider-failover-status";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Primary Groq text model for roster agent `groq`. */
export const GROQ_PRIMARY_MODEL = "llama-3.3-70b-versatile";

/** Groq vision primary (image chat). */
export const GROQ_VISION_MODEL = "llama-3.2-90b-vision-preview";

/**
 * Verified working Groq models (live probe 2026-06-24).
 * Llama + Qwen + OSS — Gemma/DeepSeek not listed on Groq API currently.
 */
export const GROQ_FALLBACK_POOL: readonly string[] = [
  "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3.6-27b",
  "qwen/qwen3-32b",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
] as const;

export type GroqMessageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string | GroqMessageContent[];
};

function extractAnswer(data: {
  choices?: Array<{ message?: { content?: string | null } }>;
}): string {
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

function isRetryableGroqFailure(status: number, message: string): boolean {
  if (status === 429 || status === 404 || status === 502 || status === 503) return true;
  return /rate.?limit|tokens per day|TPD|unavailable|decommissioned|no longer supported|capacity/i.test(
    message,
  );
}

export type GroqCallOpts = {
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "json" | "text";
};

async function callGroqOnce(
  apiKey: string,
  model: string,
  messages: GroqMessage[],
  opts: GroqCallOpts = {},
): Promise<{ ok: boolean; status: number; answer?: string; error?: string }> {
  const maxTokens = opts.maxTokens ?? 2048;
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (opts.temperature !== undefined) {
    body.temperature = opts.temperature;
  }
  if (opts.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data.error?.message || `Groq error ${response.status}`,
    };
  }

  const answer = extractAnswer(data);
  if (!answer) {
    return {
      ok: false,
      status: 502,
      error: "Groq returned empty answer",
    };
  }

  return { ok: true, status: response.status, answer };
}

/**
 * Try primary Groq model, then auto-fallback through GROQ_FALLBACK_POOL.
 */
export async function callGroqWithFallback(
  primaryModel: string,
  messages: GroqMessage[],
  opts?: GroqCallOpts,
): Promise<{ answer: string; modelUsed: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");

  try {
    const result = await callWithModelFallback({
      providerTag: "groq",
      primaryModel,
      fallbackPool: GROQ_FALLBACK_POOL,
      isRetryable: isRetryableGroqFailure,
      callOnce: (model) => callGroqOnce(apiKey, model, messages, opts),
    });
    recordProviderSuccess("groq", primaryModel, result.modelUsed);
    return result;
  } catch (err) {
    recordProviderFailure(
      "groq",
      primaryModel,
      err instanceof Error ? err.message : "Groq failed",
    );
    throw err;
  }
}

/**
 * Invoke exactly one configured Groq model — no silent multi-model fallback pool.
 * Used by agent workflow invocations (Workspace Runtime Transparency).
 */
export async function callGroqConfiguredModel(
  model: string,
  messages: GroqMessage[],
  opts?: { maxTokens?: number },
): Promise<{ answer: string; modelUsed: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY missing");
  }

  const result = await callGroqOnce(apiKey, model, messages, opts);
  if (!result.ok) {
    recordProviderFailure("groq", model, result.error ?? "Groq failed");
    throw new Error(result.error ?? `Groq error ${result.status}`);
  }
  recordProviderSuccess("groq", model, model);
  return { answer: result.answer!, modelUsed: model };
}
