import { callWithModelFallback } from "./provider-failover";
import { recordProviderFailure, recordProviderSuccess } from "./provider-failover-status";

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

type GeminiRequestBody = {
  contents: Array<{ parts: GeminiPart[] }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig?: { maxOutputTokens: number };
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
): Promise<{ ok: boolean; status: number; answer?: string; error?: string }> {
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
  };

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data.error?.message || `Gemini error ${response.status}`,
    };
  }

  const answer = extractAnswer(data);
  if (!answer) {
    return {
      ok: false,
      status: 502,
      error: "Gemini returned empty answer",
    };
  }

  return { ok: true, status: response.status, answer };
}

/**
 * Try primary Flash model, then auto-fallback through GEMINI_FALLBACK_POOL.
 */
export async function callGeminiWithFallback(
  primaryModel: string,
  opts: {
    parts: GeminiPart[];
    systemPrompt?: string;
    maxOutputTokens?: number;
  },
): Promise<{ answer: string; modelUsed: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY missing");

  const body: GeminiRequestBody = {
    contents: [{ parts: opts.parts }],
    generationConfig: { maxOutputTokens: opts.maxOutputTokens ?? 2048 },
    ...(opts.systemPrompt
      ? { systemInstruction: { parts: [{ text: opts.systemPrompt }] } }
      : {}),
  };

  try {
    const result = await callWithModelFallback({
      providerTag: "gemini",
      primaryModel,
      fallbackPool: GEMINI_FALLBACK_POOL,
      isRetryable: isRetryableGeminiFailure,
      callOnce: (model) => callGeminiOnce(apiKey, model, body),
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
  recordProviderSuccess("gemini", model, model);
  return { answer: result.answer!, modelUsed: model };
}
