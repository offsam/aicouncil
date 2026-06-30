import { callWithModelFallback, type UsageLogMeta } from "./provider-failover";
import { insertLlmUsageLog } from "./llm-usage-log";
import { recordProviderFailure, recordProviderSuccess } from "./provider-failover-status";
import { extractRawUsage } from "./tokens";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Verified working Flash models (live probe 2026-06-24). */
export const GEMINI_PRIMARY_MODEL = "gemini-2.5-flash";

export const GEMINI_FALLBACK_POOL: readonly string[] = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-flash-latest",
] as const;

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type GeminiCallOpts = {
  parts: GeminiPart[];
  systemPrompt?: string;
  maxOutputTokens?: number;
  temperature?: number;
};

type GeminiRequestBody = {
  contents: Array<{ parts: GeminiPart[] }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig?: { maxOutputTokens?: number; temperature?: number };
};

function extractAnswer(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

function isRetryableGeminiFailure(status: number, message: string): boolean {
  if (status === 429 || status === 404 || status === 502 || status === 503) return true;
  return /unavailable|no longer available|not found|rate.?limit|high demand|quota|resource exhausted/i.test(
    message,
  );
}

async function callGeminiOnce(
  apiKey: string,
  model: string,
  body: GeminiRequestBody,
): Promise<{ ok: boolean; status: number; answer?: string; error?: string; rawUsage?: unknown }> {
  const response = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
    usageMetadata?: unknown;
  };

  const rawUsage = extractRawUsage("gemini", data);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data.error?.message || `Gemini error ${response.status}`,
      rawUsage,
    };
  }

  const answer = extractAnswer(data);
  if (!answer) {
    return {
      ok: false,
      status: 502,
      error: "Gemini returned empty answer",
      rawUsage,
    };
  }

  return { ok: true, status: response.status, answer, rawUsage };
}

/**
 * Try primary Flash model, then auto-fallback through GEMINI_FALLBACK_POOL.
 */
export async function callGeminiWithFallback(
  primaryModel: string,
  opts: GeminiCallOpts & { usageLog?: UsageLogMeta },
): Promise<{ answer: string; modelUsed: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY missing");

  const { usageLog, ...callOpts } = opts;

  const generationConfig: GeminiRequestBody["generationConfig"] = {
    maxOutputTokens: callOpts.maxOutputTokens ?? 2048,
  };
  if (callOpts.temperature !== undefined) {
    generationConfig.temperature = callOpts.temperature;
  }

  const body: GeminiRequestBody = {
    contents: [{ parts: callOpts.parts }],
    generationConfig,
    ...(callOpts.systemPrompt
      ? { systemInstruction: { parts: [{ text: callOpts.systemPrompt }] } }
      : {}),
  };

  try {
    const result = await callWithModelFallback({
      providerTag: "gemini",
      primaryModel,
      fallbackPool: GEMINI_FALLBACK_POOL,
      isRetryable: isRetryableGeminiFailure,
      callOnce: (model) => callGeminiOnce(apiKey, model, body),
      usageLog,
    });
    recordProviderSuccess("gemini", primaryModel, result.modelUsed);
    return result;
  } catch (err) {
    recordProviderFailure(
      "gemini",
      primaryModel,
      err instanceof Error ? err.message : "Gemini failed",
    );
    throw err;
  }
}

/** Invoke exactly one configured Gemini model — no silent fallback pool. */
export async function callGeminiConfiguredModel(
  model: string,
  opts: {
    parts: GeminiPart[];
    systemPrompt?: string;
    maxTokens?: number;
    usagePurpose?: string;
    usageIsFallback?: boolean;
  },
): Promise<{ answer: string; modelUsed: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY missing");

  const body: GeminiRequestBody = {
    contents: [{ parts: opts.parts }],
    generationConfig: { maxOutputTokens: opts.maxTokens ?? 2048 },
    ...(opts.systemPrompt
      ? { systemInstruction: { parts: [{ text: opts.systemPrompt }] } }
      : {}),
  };

  const result = await callGeminiOnce(apiKey, model, body);
  if (!result.ok) {
    recordProviderFailure("gemini", model, result.error ?? "Gemini failed");
    throw new Error(result.error ?? `Gemini error ${result.status}`);
  }
  if (opts.usagePurpose) {
    await insertLlmUsageLog({
      provider: "gemini",
      modelId: model,
      purpose: opts.usagePurpose,
      rawUsage: result.rawUsage ?? null,
      isFallback: opts.usageIsFallback ?? false,
    });
  }
  recordProviderSuccess("gemini", model, model);
  return { answer: result.answer!, modelUsed: model };
}
