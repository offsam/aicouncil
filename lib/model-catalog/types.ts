import type { CostTier } from "@/lib/cost-tier";

export type ModelGateway =
  | "openrouter"
  | "groq"
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek";

export type ModelSpecialization =
  | "code"
  | "analysis"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "general";

/** Models we classify but hide from the picker (embeddings, guards, etc.). */
export type ExcludedSpecialization = "excluded";

export type CatalogModel = {
  /** Stable key for UI and dedupe: `${gateway}:${modelId}` */
  key: string;
  gateway: ModelGateway;
  modelId: string;
  displayName: string;
  originProvider: string;
  originProviderSlug: string;
  specializations: ModelSpecialization[];
  primarySpecialization: ModelSpecialization;
  costTier: CostTier;
};

export type CatalogCategoryBlock = {
  id: ModelSpecialization;
  label: string;
  hint: string;
  models: CatalogModel[];
};

export const SPECIALIZATION_ORDER: ModelSpecialization[] = [
  "code",
  "analysis",
  "text",
  "image",
  "video",
  "audio",
  "general",
];

export const SPECIALIZATION_META: Record<
  ModelSpecialization,
  { label: string; hint: string }
> = {
  code: {
    label: "Код",
    hint: "написание кода, скрипты, отладка",
  },
  analysis: {
    label: "Аналитика",
    hint: "рассуждение, планирование, research",
  },
  text: {
    label: "Текст",
    hint: "копирайтинг, редактура, переводы",
  },
  image: {
    label: "Изображения",
    hint: "генерация и работа с картинками",
  },
  video: {
    label: "Видео",
    hint: "генерация и обработка видео",
  },
  audio: {
    label: "Аудио",
    hint: "речь, TTS, транскрипция",
  },
  general: {
    label: "Общие",
    hint: "универсальные chat-модели",
  },
};
