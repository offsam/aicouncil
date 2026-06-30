import {
  CONTEXT_ACCESS_DENIED_PUBLIC_MESSAGE,
  isContextAccessDeniedError,
} from "./security/agent-context-access";

/** Plain-language user message — never expose provider/model/quota details. */
export const PROVIDER_UNAVAILABLE_USER_MESSAGE =
  "Сейчас я не смог получить ответ от модели. Попробуйте ещё раз через минуту.";

/** Delegation/graph configuration gap — building missing or not executable. */
export const BUILDING_NOT_CONFIGURED_USER_MESSAGE =
  "Это здание пока не настроено для обработки запросов. Сформулируйте запрос иначе или уточните, к какому отделу он относится.";

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

const DELEGATION_CONFIG_PATTERN =
  /Main chamber \(Manager\) не найден|building_not_configured|fallback_no_main_chamber|fallback_invalid_or_low_confidence/i;

/** Map chat/delegation failures to safe user-facing text (provider + graph config gaps). */
export function toUserFacingChatError(err: unknown): string {
  if (isContextAccessDeniedError(err)) {
    return CONTEXT_ACCESS_DENIED_PUBLIC_MESSAGE;
  }
  if (err instanceof Error) {
    if (DELEGATION_CONFIG_PATTERN.test(err.message)) {
      return BUILDING_NOT_CONFIGURED_USER_MESSAGE;
    }
    return toUserFacingProviderError(err);
  }
  if (typeof err === "string" && DELEGATION_CONFIG_PATTERN.test(err)) {
    return BUILDING_NOT_CONFIGURED_USER_MESSAGE;
  }
  return toUserFacingProviderError(err);
}

/** HTTP status for unified chat / ask endpoints. */
export function chatErrorHttpStatus(err: unknown): number {
  if (isContextAccessDeniedError(err)) return 403;
  return 500;
}

/** Map any provider failure to a safe user-facing message; preserve detail in logs only. */
export function toUserFacingProviderError(err: unknown): string {
  if (isContextAccessDeniedError(err)) {
    return CONTEXT_ACCESS_DENIED_PUBLIC_MESSAGE;
  }
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
