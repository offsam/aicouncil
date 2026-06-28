import { parseAnthropicError, parseOpenAIError } from "./api-types";
import { callGeminiConfiguredModel } from "./gemini-models";
import { callGroqConfiguredModel, type GroqMessage } from "./groq-models";
import { callOpenRouterConfiguredModel } from "./openrouter-free";
import type { AgentRuntimeConfig } from "./agent-runtime-config";
import { ProviderInvokeError } from "./provider-user-error";

type AgentProviderCallParams = {
  config: AgentRuntimeConfig;
  systemPrompt: string;
  question: string;
  maxTokens?: number;
};

function chatMessages(systemPrompt: string, question: string): GroqMessage[] {
  return [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    { role: "user" as const, content: question },
  ];
}

async function callAnthropicConfigured(
  modelId: string,
  systemPrompt: string,
  question: string,
  maxTokens: number,
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
      messages: [{ role: "user", content: question }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
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
  return answer;
}

async function callOpenAIConfigured(
  modelId: string,
  systemPrompt: string,
  question: string,
  maxTokens: number,
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
      max_tokens: maxTokens,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: question },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new ProviderInvokeError("openai", modelId, parseOpenAIError(response.status, data));
  }

  const answer = (
    data as { choices?: Array<{ message?: { content?: string | null } }> }
  ).choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new ProviderInvokeError("openai", modelId, "OpenAI returned empty answer");
  }
  return answer;
}

/**
 * Invoke the agent's configured provider/model only — no slug-based substitution
 * and no silent multi-model fallback pools (Workspace Runtime Transparency).
 */
export async function callConfiguredAgentProvider(params: AgentProviderCallParams): Promise<string> {
  const maxTokens = params.maxTokens ?? 2048;
  const { config, systemPrompt, question } = params;
  const provider = config.provider;

  if (provider === "anthropic") {
    return callAnthropicConfigured(config.modelId, systemPrompt, question, maxTokens);
  }

  if (provider === "openai") {
    return callOpenAIConfigured(config.modelId, systemPrompt, question, maxTokens);
  }

  if (provider === "groq") {
    try {
      const { answer } = await callGroqConfiguredModel(
        config.modelId,
        chatMessages(systemPrompt, question),
        { maxTokens },
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
      const { answer } = await callGeminiConfiguredModel(config.modelId, {
        parts: [{ text: question }],
        systemPrompt,
        maxTokens,
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
    const messages = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user" as const, content: question },
    ];
    try {
      const { answer } = await callOpenRouterConfiguredModel(config.modelId, messages, {
        maxTokens,
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
