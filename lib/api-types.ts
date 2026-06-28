export interface AskRequestBody {
  question?: string;
  imageBase64?: string;
  imageMediaType?: string;
}

export interface AskResponseBody {
  answer?: string;
  usage?: import("./tokens").TokenUsage;
  error?: string;
}

export interface ConsensusRequestBody {
  answers: Array<{ agent: string; answer: string }>;
}

export interface AnalysisReport {
  consensus: string;
  differences: string;
  bestAnswer: string;
  finalVerdict: string;
  bestModel?: string;
}

export interface ConsensusResponseBody {
  report?: AnalysisReport;
  consensus?: string;
  usage?: import("./tokens").TokenUsage;
  error?: string;
}

export function parseAnthropicError(status: number, body: unknown): string {
  const message =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: { message?: string } }).error?.message === "string"
      ? (body as { error: { message: string } }).error.message
      : "";

  if (status === 401 || status === 403) {
    return "Неверный API-ключ Anthropic. Проверьте ANTHROPIC_API_KEY.";
  }
  if (status === 429) {
    return "Превышен лимит запросов Anthropic. Попробуйте позже.";
  }
  if (status === 529) {
    return "Сервис Anthropic временно перегружен. Попробуйте позже.";
  }
  return message || `Ошибка Anthropic API (${status}).`;
}

export function parseOpenAIError(status: number, body: unknown): string {
  const message =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: { message?: string } }).error?.message === "string"
      ? (body as { error: { message: string } }).error.message
      : "";

  if (status === 401 || status === 403) {
    return "Неверный API-ключ OpenAI. Проверьте OPENAI_API_KEY.";
  }
  if (status === 429) {
    return "Превышен лимит запросов OpenAI. Попробуйте позже.";
  }
  return message || `Ошибка OpenAI API (${status}).`;
}

export function parseGoogleError(status: number, body: unknown): string {
  const message =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: { message?: string } }).error?.message === "string"
      ? (body as { error: { message: string } }).error.message
      : "";

  if (status === 401 || status === 403) {
    return "Неверный API-ключ Google. Проверьте GOOGLE_API_KEY.";
  }
  if (status === 429) {
    return "Превышен лимит запросов Gemini. Попробуйте позже.";
  }
  return message || `Ошибка Gemini API (${status}).`;
}

export function parseGroqError(status: number, body: unknown): string {
  const message =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: { message?: string } }).error?.message === "string"
      ? (body as { error: { message: string } }).error.message
      : "";

  if (status === 401 || status === 403) {
    return "Неверный API-ключ Groq. Проверьте GROQ_API_KEY.";
  }
  if (status === 429) {
    return "Превышен лимит запросов Groq. Попробуйте позже.";
  }
  return message || `Ошибка Groq API (${status}).`;
}

export function parseDeepSeekError(status: number, body: unknown): string {
  const message =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: { message?: string } }).error?.message === "string"
      ? (body as { error: { message: string } }).error.message
      : "";

  if (status === 401 || status === 403) {
    return "Неверный API-ключ DeepSeek. Проверьте DEEPSEEK_API_KEY.";
  }
  if (status === 429) {
    return "Превышен лимит запросов DeepSeek. Попробуйте позже.";
  }
  return message || `Ошибка DeepSeek API (${status}).`;
}

export function parseOpenRouterError(status: number, body: unknown): string {
  const message =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: { message?: string } }).error?.message === "string"
      ? (body as { error: { message: string } }).error.message
      : "";

  if (status === 401 || status === 403) {
    return "Неверный API-ключ OpenRouter. Проверьте OPENROUTER_API_KEY.";
  }
  if (status === 429) {
    return "Превышен лимит запросов OpenRouter. Попробуйте позже.";
  }
  return message || `Ошибка OpenRouter API (${status}).`;
}

export function validateAskInput(body: AskRequestBody): string | null {
  const question = body.question?.trim() ?? "";
  const hasImage = Boolean(body.imageBase64?.trim());

  if (!question && !hasImage) {
    return "Введите вопрос и/или загрузите изображение.";
  }

  return null;
}
