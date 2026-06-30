export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export function anthropicUsage(data: unknown): TokenUsage | undefined {
  const usage = (
    data as {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    }
  ).usage;
  if (!usage) return undefined;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const result: TokenUsage = { input, output, total: input + output };
  if (usage.cache_creation_input_tokens != null) {
    result.cacheCreationInputTokens = usage.cache_creation_input_tokens;
  }
  if (usage.cache_read_input_tokens != null) {
    result.cacheReadInputTokens = usage.cache_read_input_tokens;
  }
  return result;
}

export function openAIUsage(data: unknown): TokenUsage | undefined {
  const usage = (
    data as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }
  ).usage;
  if (!usage) return undefined;
  const input = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  return {
    input,
    output,
    total: usage.total_tokens ?? input + output,
  };
}

export function geminiUsage(data: unknown): TokenUsage | undefined {
  const meta = (
    data as {
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }
  ).usageMetadata;
  if (!meta) return undefined;
  const input = meta.promptTokenCount ?? 0;
  const output = meta.candidatesTokenCount ?? 0;
  return {
    input,
    output,
    total: meta.totalTokenCount ?? input + output,
  };
}

export function formatTokens(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function sumTokens(
  entries: Array<TokenUsage | undefined>,
): TokenUsage {
  return entries.reduce<TokenUsage>(
    (acc, t) => {
      if (!t) return acc;
      return {
        input: acc.input + t.input,
        output: acc.output + t.output,
        total: acc.total + t.total,
      };
    },
    { input: 0, output: 0, total: 0 },
  );
}

/** OpenAI-compatible usage block (OpenAI, Groq, DeepSeek, OpenRouter). */
export function openAICompatibleUsage(data: unknown): TokenUsage | undefined {
  const usage = (
    data as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        input_tokens?: number;
        output_tokens?: number;
      };
    }
  ).usage;
  if (!usage) return undefined;
  const input = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const output = usage.completion_tokens ?? usage.output_tokens ?? 0;
  return {
    input,
    output,
    total: usage.total_tokens ?? input + output,
  };
}

export function extractRawUsage(provider: string, data: unknown): unknown {
  if (data == null || typeof data !== "object") return null;
  const p = provider.toLowerCase();
  if (p === "anthropic") {
    return (data as { usage?: unknown }).usage ?? null;
  }
  if (p === "google" || p === "gemini") {
    return (data as { usageMetadata?: unknown }).usageMetadata ?? null;
  }
  return (data as { usage?: unknown }).usage ?? null;
}

export function normalizeProviderUsage(
  provider: string,
  rawUsage: unknown,
): TokenUsage | null {
  if (rawUsage == null) return null;
  const p = provider.toLowerCase();
  if (p === "anthropic") {
    return anthropicUsage({ usage: rawUsage }) ?? null;
  }
  if (p === "google" || p === "gemini") {
    return geminiUsage({ usageMetadata: rawUsage }) ?? null;
  }
  return openAICompatibleUsage({ usage: rawUsage }) ?? null;
}
