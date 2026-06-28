/** Plain-language user message — never expose provider/model/quota details. */
export const PROVIDER_UNAVAILABLE_USER_MESSAGE =
  "Сейчас я не смог получить ответ от модели. Попробуйте ещё раз через минуту.";

/** Thrown when a configured provider call fails; carries sanitized user text. */
export class ProviderInvokeError extends Error {
  readonly provider: string;
  readonly modelId: string;
  readonly userMessage: string;

  constructor(provider: string, modelId: string, internalMessage: string) {
    super(internalMessage);
    this.name = "ProviderInvokeError";
    this.provider = provider;
    this.modelId = modelId;
    this.userMessage = PROVIDER_UNAVAILABLE_USER_MESSAGE;
  }
}

const PROVIDER_LEAK_PATTERN =
  /groq|openai|anthropic|anthropic\.com|llama|gpt-|claude|gemini|mistral|deepseek|openrouter|rate.?limit|tokens per (?:day|minute)|\bTP[MD]\b|429|quota|org_01/i;

/** Map any provider failure to a safe user-facing message; preserve detail in logs only. */
export function toUserFacingProviderError(err: unknown): string {
  if (err instanceof ProviderInvokeError) {
    return err.userMessage;
  }
  if (err instanceof Error && PROVIDER_LEAK_PATTERN.test(err.message)) {
    return PROVIDER_UNAVAILABLE_USER_MESSAGE;
  }
  if (typeof err === "string" && PROVIDER_LEAK_PATTERN.test(err)) {
    return PROVIDER_UNAVAILABLE_USER_MESSAGE;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return PROVIDER_UNAVAILABLE_USER_MESSAGE;
}

/** True when text looks like a raw provider/quota error that must not reach users. */
export function looksLikeProviderErrorText(text: string): boolean {
  return PROVIDER_LEAK_PATTERN.test(text);
}

/** Sanitize arbitrary answer/error text before returning to user-facing channels. */
export function sanitizeUserFacingText(text: string): string {
  if (!text.trim()) return text;
  if (looksLikeProviderErrorText(text)) {
    return PROVIDER_UNAVAILABLE_USER_MESSAGE;
  }
  return text;
}
