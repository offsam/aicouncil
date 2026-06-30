import { parseAnthropicError, parseDeepSeekError, parseOpenAIError } from "./api-types";
import { callGeminiConfiguredModel } from "./gemini-models";
import { callGroqConfiguredModel, type GroqMessage } from "./groq-models";
import { insertLlmUsageLog } from "./llm-usage-log";
import { buildOpenAiTokenLimitFields } from "./openai-token-limit";
import { callOpenRouterConfiguredModel } from "./openrouter-free";
import type { AgentRuntimeConfig } from "./agent-runtime-config";
import { ProviderInvokeError } from "./provider-user-error";
import { extractRawUsage } from "./tokens";

type AgentProviderCallParams = {
  config: AgentRuntimeConfig;
  systemPrompt: string;
  question: string;
  maxTokens?: number;
  /** Prior user/assistant turns for the same conversation (excludes current question). */
  conversationHistory?: MayorConversationTurn[];
  /** llm_usage_logs.purpose — e.g. mayor_answer, manager_answer, agent_invoke. */
  usagePurpose?: string;
  usageIsFallback?: boolean;
};

type MayorConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

function providerMessages(
  systemPrompt: string,
  question: string,
  conversationHistory: MayorConversationTurn[] = [],
): GroqMessage[] {
  const historyMessages = conversationHistory.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));
  return [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...historyMessages,
    { role: "user" as const, content: question },
  ];
}

function anthropicMessages(
  question: string,
  conversationHistory: MayorConversationTurn[] = [],
): Array<{ role: "user" | "assistant"; content: string }> {
  return [
    ...conversationHistory.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    { role: "user" as const, content: question },
  ];
}

type ConfiguredCallMeta = {
  purpose: string;
  isFallback?: boolean;
};

async function callAnthropicConfigured(
  modelId: string,
  systemPrompt: string,
  question: string,
  maxTokens: number,
  conversationHistory: MayorConversationTurn[] = [],
  meta?: ConfiguredCallMeta,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ProviderInvokeError("anthropic", modelId, "ANTHROPIC_API_KEY missing");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      system: systemPrompt || undefined,
      messages: anthropicMessages(question, conversationHistory),
    }),
  });

  const data = await response.json();
  const rawUsage = extractRawUsage("anthropic", data);
  if (!response.ok) {
    if (rawUsage != null && meta?.purpose) {
      await insertLlmUsageLog({
        provider: "anthropic",
        modelId,
        purpose: meta.purpose,
        rawUsage,
        error: parseAnthropicError(response.status, data),
        isFallback: meta.isFallback ?? false,
      });
    }
    throw new ProviderInvokeError(
      "anthropic",
      modelId,
      parseAnthropicError(response.status, data),
    );
  }

  const textBlock = (
    data as { content?: Array<{ type: string; text?: string }> }
  ).content?.find((block) => block.type === "text");
  const answer = textBlock?.text?.trim();
  if (!answer) {
    throw new ProviderInvokeError("anthropic", modelId, "Anthropic returned empty answer");
  }
  if (meta?.purpose) {
    await insertLlmUsageLog({
      provider: "anthropic",
      modelId,
      purpose: meta.purpose,
      rawUsage: rawUsage ?? null,
      isFallback: meta.isFallback ?? false,
    });
  }
  return answer;
}

async function callOpenAIConfigured(
  modelId: string,
  systemPrompt: string,
  question: string,
  maxTokens: number,
  conversationHistory: MayorConversationTurn[] = [],
  meta?: ConfiguredCallMeta,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ProviderInvokeError("openai", modelId, "OPENAI_API_KEY missing");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      ...buildOpenAiTokenLimitFields(modelId, maxTokens),
      messages: providerMessages(systemPrompt, question, conversationHistory).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  const data = await response.json();
  const rawUsage = extractRawUsage("openai", data);
  if (!response.ok) {
    if (rawUsage != null && meta?.purpose) {
      await insertLlmUsageLog({
        provider: "openai",
        modelId,
        purpose: meta.purpose,
        rawUsage,
        error: parseOpenAIError(response.status, data),
        isFallback: meta.isFallback ?? false,
      });
    }
    throw new ProviderInvokeError("openai", modelId, parseOpenAIError(response.status, data));
  }

  const answer = (
    data as { choices?: Array<{ message?: { content?: string | null } }> }
  ).choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new ProviderInvokeError("openai", modelId, "OpenAI returned empty answer");
  }
  if (meta?.purpose) {
    await insertLlmUsageLog({
      provider: "openai",
      modelId,
      purpose: meta.purpose,
      rawUsage: rawUsage ?? null,
      isFallback: meta.isFallback ?? false,
    });
  }
  return answer;
}

async function callDeepSeekConfigured(
  modelId: string,
  systemPrompt: string,
  question: string,
  maxTokens: number,
  conversationHistory: MayorConversationTurn[] = [],
  meta?: ConfiguredCallMeta,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new ProviderInvokeError("deepseek", modelId, "DEEPSEEK_API_KEY missing");
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      messages: providerMessages(systemPrompt, question, conversationHistory).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  const data = await response.json();
  const rawUsage = extractRawUsage("deepseek", data);
  if (!response.ok) {
    if (rawUsage != null && meta?.purpose) {
      await insertLlmUsageLog({
        provider: "deepseek",
        modelId,
        purpose: meta.purpose,
        rawUsage,
        error: parseDeepSeekError(response.status, data),
        isFallback: meta.isFallback ?? false,
      });
    }
    throw new ProviderInvokeError(
      "deepseek",
      modelId,
      parseDeepSeekError(response.status, data),
    );
  }

  const answer = (
    data as { choices?: Array<{ message?: { content?: string | null } }> }
  ).choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new ProviderInvokeError("deepseek", modelId, "DeepSeek returned empty answer");
  }
  if (meta?.purpose) {
    await insertLlmUsageLog({
      provider: "deepseek",
      modelId,
      purpose: meta.purpose,
      rawUsage: rawUsage ?? null,
      isFallback: meta.isFallback ?? false,
    });
  }
  return answer;
}

/**
 * Invoke the agent's configured provider/model only — no slug-based substitution
 * and no silent multi-model fallback pools (Workspace Runtime Transparency).
 */
export async function callConfiguredAgentProvider(params: AgentProviderCallParams): Promise<string> {
  const maxTokens = params.maxTokens ?? 2048;
  const { config, systemPrompt, question, conversationHistory = [] } = params;
  const provider = config.provider;
  const purpose = params.usagePurpose ?? "agent_invoke";
  const meta: ConfiguredCallMeta = {
    purpose,
    isFallback: params.usageIsFallback ?? false,
  };

  if (provider === "anthropic") {
    return callAnthropicConfigured(
      config.modelId,
      systemPrompt,
      question,
      maxTokens,
      conversationHistory,
      meta,
    );
  }

  if (provider === "openai") {
    return callOpenAIConfigured(
      config.modelId,
      systemPrompt,
      question,
      maxTokens,
      conversationHistory,
      meta,
    );
  }

  if (provider === "deepseek") {
    return callDeepSeekConfigured(
      config.modelId,
      systemPrompt,
      question,
      maxTokens,
      conversationHistory,
      meta,
    );
  }

  if (provider === "groq") {
    try {
      const { answer } = await callGroqConfiguredModel(
        config.modelId,
        providerMessages(systemPrompt, question, conversationHistory),
        { maxTokens, usagePurpose: purpose, usageIsFallback: params.usageIsFallback },
      );
      return answer;
    } catch (err) {
      throw new ProviderInvokeError(
        "groq",
        config.modelId,
        err instanceof Error ? err.message : "Groq failed",
      );
    }
  }

  if (provider === "google" || provider === "gemini") {
    try {
      const historyBlock =
        conversationHistory.length > 0
          ? `\n\n[Prior conversation]\n${conversationHistory
              .map((t) => `${t.role}: ${t.content}`)
              .join("\n")}`
          : "";
      const { answer } = await callGeminiConfiguredModel(config.modelId, {
        parts: [{ text: question }],
        systemPrompt: `${systemPrompt}${historyBlock}`.trim(),
        maxTokens,
        usagePurpose: purpose,
        usageIsFallback: params.usageIsFallback,
      });
      return answer;
    } catch (err) {
      throw new ProviderInvokeError(
        provider,
        config.modelId,
        err instanceof Error ? err.message : "Gemini failed",
      );
    }
  }

  if (provider === "openrouter") {
    const messages = providerMessages(systemPrompt, question, conversationHistory).map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));
    try {
      const { answer } = await callOpenRouterConfiguredModel(config.modelId, messages, {
        maxTokens,
        usagePurpose: purpose,
        usageIsFallback: params.usageIsFallback,
      });
      return answer;
    } catch (err) {
      throw new ProviderInvokeError(
        "openrouter",
        config.modelId,
        err instanceof Error ? err.message : "OpenRouter failed",
      );
    }
  }

  throw new ProviderInvokeError(
    provider,
    config.modelId,
    `Unsupported agent provider "${provider}" — configure a supported provider on the canvas.`,
  );
}
