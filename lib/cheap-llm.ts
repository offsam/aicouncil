import { callAnthropicWithFallback } from "./anthropic-models";
import { callGroqWithFallback } from "./groq-models";
import { callGeminiWithFallback } from "./gemini-models";
import { callOpenAIWithFallback } from "./openai-models";
import {
  defaultHardcodedRoleConfig,
  loadSystemLlmRoleConfig,
  resolveSystemLlmRole,
  type SystemLlmProvider,
  type SystemLlmRoleConfig,
} from "./system-llm-roles";

export type InvokeCheapLLMParams = {
  /** For logs/diagnostics, e.g. "city-router", "manager-routing". */
  purpose: string;
  prompt: string;
  responseFormat?: "json" | "text";
  temperature?: number;
  maxTokens?: number;
  /** When set, load per-office role config from system_llm_roles before provider calls. */
  officeId?: string;
};

async function invokeConfiguredProvider(
  provider: SystemLlmProvider,
  model: string,
  params: Pick<InvokeCheapLLMParams, "prompt" | "responseFormat" | "temperature" | "maxTokens">,
): Promise<{ answer: string; modelUsed: string }> {
  const { prompt, responseFormat = "text", temperature = 0.1, maxTokens } = params;
  if (provider === "groq") {
    return callGroqWithFallback(model, [{ role: "user", content: prompt }], {
      maxTokens,
      temperature,
      responseFormat,
    });
  }
  if (provider === "anthropic") {
    return callAnthropicWithFallback(model, prompt, {
      maxTokens,
      temperature,
    });
  }
  if (provider === "openai") {
    return callOpenAIWithFallback(model, prompt, {
      maxTokens,
      temperature,
      responseFormat,
    });
  }
  return callGeminiWithFallback(model, {
    parts: [{ text: prompt }],
    maxOutputTokens: maxTokens,
    temperature,
  });
}

async function resolveRoleConfig(
  purpose: string,
  officeId?: string,
): Promise<{ role: ReturnType<typeof resolveSystemLlmRole>; config: SystemLlmRoleConfig }> {
  const role = resolveSystemLlmRole(purpose);
  if (officeId && role) {
    const loaded = await loadSystemLlmRoleConfig(officeId, role);
    if (loaded) return { role, config: loaded };
  }
  return { role, config: defaultHardcodedRoleConfig() };
}

/**
 * Unified cheap LLM: primary provider/model (with provider pool fallback), then fallback provider/model.
 * Per-office overrides via system_llm_roles when officeId is provided; otherwise hardcoded defaults.
 */
export async function invokeCheapLLM(params: InvokeCheapLLMParams): Promise<string> {
  const {
    purpose,
    prompt,
    responseFormat = "text",
    temperature = 0.1,
    maxTokens,
    officeId,
  } = params;

  const { role, config } = await resolveRoleConfig(purpose, officeId);
  const roleTag = role ?? "unknown";

  let primaryError: string | undefined;
  try {
    const { answer, modelUsed } = await invokeConfiguredProvider(
      config.primaryProvider,
      config.primaryModel,
      { prompt, responseFormat, temperature, maxTokens },
    );
    console.info(
      `[invokeCheapLLM] purpose=${purpose} role=${roleTag} provider=${config.primaryProvider} model=${modelUsed}`,
    );
    return answer;
  } catch (err) {
    primaryError = err instanceof Error ? err.message : String(err);
    console.warn(
      `[invokeCheapLLM] purpose=${purpose} role=${roleTag} ${config.primaryProvider} failed: ${primaryError}`,
    );
  }

  let fallbackError: string | undefined;
  try {
    const { answer, modelUsed } = await invokeConfiguredProvider(
      config.fallbackProvider,
      config.fallbackModel,
      { prompt, responseFormat, temperature, maxTokens },
    );
    console.info(
      `[invokeCheapLLM] purpose=${purpose} role=${roleTag} provider=${config.fallbackProvider} model=${modelUsed}`,
    );
    return answer;
  } catch (err) {
    fallbackError = err instanceof Error ? err.message : String(err);
    console.warn(
      `[invokeCheapLLM] purpose=${purpose} role=${roleTag} ${config.fallbackProvider} failed: ${fallbackError}`,
    );
  }

  throw new Error(
    `invokeCheapLLM failed (purpose=${purpose}): ${config.primaryProvider}: ${primaryError ?? "unknown"}; ${config.fallbackProvider}: ${fallbackError ?? "unknown"}`,
  );
}
