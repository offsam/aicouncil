/**
 * OpenAI Chat Completions token cap parameter selection.
 *
 * Reasoning / o-series and GPT-5+ models reject `max_tokens` and require
 * `max_completion_tokens` (OpenAI o1 launch notes; GPT-5.x enforcement).
 * Legacy GPT-4 / GPT-4o family continues to accept `max_tokens` — verified on prod (gpt-4o debate mid tier).
 */
export const OPENAI_MAX_COMPLETION_TOKENS_MODEL_PATTERNS: readonly RegExp[] = [
  /** o1, o3, o4-mini, … */
  /^o\d/,
  /** gpt-5, gpt-5.5, gpt-5.4-2026-03-05, … */
  /^gpt-5/,
];

export function openAiUsesMaxCompletionTokens(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return OPENAI_MAX_COMPLETION_TOKENS_MODEL_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

/** Body fragment for OpenAI chat/completions token limit. */
export function buildOpenAiTokenLimitFields(
  modelId: string,
  maxTokens: number,
): { max_tokens: number } | { max_completion_tokens: number } {
  if (openAiUsesMaxCompletionTokens(modelId)) {
    return { max_completion_tokens: maxTokens };
  }
  return { max_tokens: maxTokens };
}
