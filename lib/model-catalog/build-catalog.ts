import {
  agentCategoryFromSpecialization,
  classifyModelSpecializations,
  pickPrimarySpecialization,
} from "./classify-specialization";
import { inferCatalogCostTier, parseOpenRouterPrice } from "./infer-cost-tier";
import {
  buildCatalogKey,
  resolveOriginFromModelId,
  shortModelDisplayName,
} from "./resolve-origin-provider";
import type { CatalogCategoryBlock, CatalogModel, ModelGateway } from "./types";
import { SPECIALIZATION_META, SPECIALIZATION_ORDER } from "./types";
import { sortCatalogModelsForDisplay } from "./popular-models";

type RawModel = {
  gateway: ModelGateway;
  modelId: string;
  name?: string;
  ownedBy?: string | null;
  modality?: string | null;
  inputModalities?: string[] | null;
  outputModalities?: string[] | null;
  supportedMethods?: string[] | null;
  promptPrice?: number | null;
  completionPrice?: number | null;
};

let cache: { fetchedAt: number; models: CatalogModel[] } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function getModelCatalog(): Promise<CatalogModel[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models;
  }
  const raw = await fetchAllProviderModels();
  const models = raw
    .map(normalizeRawModel)
    .filter((model): model is CatalogModel => model != null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  cache = { fetchedAt: now, models };
  return models;
}

export function groupCatalogByCategory(models: CatalogModel[]): CatalogCategoryBlock[] {
  return SPECIALIZATION_ORDER.map((id) => ({
    id,
    label: SPECIALIZATION_META[id].label,
    hint: SPECIALIZATION_META[id].hint,
    models: sortCatalogModelsForDisplay(models.filter((m) => m.primarySpecialization === id)),
  })).filter((block) => block.models.length > 0);
}

export function filterCatalogModels(
  models: CatalogModel[],
  opts: {
    specialization?: string | null;
    costTier?: string | null;
    gateway?: string | null;
    query?: string | null;
  },
): CatalogModel[] {
  const q = opts.query?.trim().toLowerCase();
  const gateway = opts.gateway?.trim().toLowerCase();
  return models.filter((model) => {
    if (opts.specialization && !model.specializations.includes(opts.specialization as never)) {
      return false;
    }
    if (opts.costTier && model.costTier !== opts.costTier) {
      return false;
    }
    if (gateway && model.gateway !== gateway) {
      return false;
    }
    if (q) {
      const hay =
        `${model.displayName} ${model.modelId} ${model.originProvider} ${model.gateway}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function normalizeRawModel(raw: RawModel): CatalogModel | null {
  const classified = classifyModelSpecializations({
    modelId: raw.modelId,
    name: raw.name,
    modality: raw.modality,
    inputModalities: raw.inputModalities,
    outputModalities: raw.outputModalities,
    supportedMethods: raw.supportedMethods,
  });

  if (classified.length === 1 && classified[0] === "excluded") {
    return null;
  }

  const specializations = classified as CatalogModel["specializations"];
  const primarySpecialization = pickPrimarySpecialization(specializations);
  const origin = resolveOriginFromModelId(raw.modelId, raw.gateway, raw.ownedBy);

  if (origin.slug === "openrouter") {
    return null;
  }

  return {
    key: buildCatalogKey(raw.gateway, raw.modelId),
    gateway: raw.gateway,
    modelId: raw.modelId,
    displayName: shortModelDisplayName(raw.modelId, raw.name),
    originProvider: origin.label,
    originProviderSlug: origin.slug,
    specializations,
    primarySpecialization,
    costTier: inferCatalogCostTier({
      modelId: raw.modelId,
      gateway: raw.gateway,
      promptPrice: raw.promptPrice,
      completionPrice: raw.completionPrice,
    }),
  };
}

export { agentCategoryFromSpecialization };

async function fetchAllProviderModels(): Promise<RawModel[]> {
  const results = await Promise.allSettled([
    fetchOpenRouterModels(),
    fetchGroqModels(),
    fetchAnthropicModels(),
    fetchOpenAiModels(),
    fetchGoogleModels(),
    fetchDeepSeekModels(),
  ]);

  const models: RawModel[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      models.push(...result.value);
    }
  }
  return models;
}

async function fetchOpenRouterModels(): Promise<RawModel[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];

  const body = (await res.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      architecture?: {
        modality?: string;
        input_modalities?: string[];
        output_modalities?: string[];
      };
      pricing?: { prompt?: string; completion?: string };
    }>;
  };

  return (body.data ?? [])
    .filter((m) => {
      const modality = m.architecture?.modality ?? "";
      return modality.includes("text") || modality.includes("->text");
    })
    .map((m) => ({
      gateway: "openrouter" as const,
      modelId: m.id,
      name: m.name,
      modality: m.architecture?.modality ?? null,
      inputModalities: m.architecture?.input_modalities ?? null,
      outputModalities: m.architecture?.output_modalities ?? null,
      promptPrice: parseOpenRouterPrice(m.pricing?.prompt),
      completionPrice: parseOpenRouterPrice(m.pricing?.completion),
    }));
}

async function fetchGroqModels(): Promise<RawModel[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return [];

  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];

  const body = (await res.json()) as {
    data?: Array<{ id: string; owned_by?: string }>;
  };

  return (body.data ?? []).map((m) => ({
    gateway: "groq" as const,
    modelId: m.id,
    name: m.id,
    ownedBy: m.owned_by ?? null,
  }));
}

async function fetchAnthropicModels(): Promise<RawModel[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];

  const body = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
  return (body.data ?? []).map((m) => ({
    gateway: "anthropic" as const,
    modelId: m.id,
    name: m.display_name ?? m.id,
  }));
}

async function fetchOpenAiModels(): Promise<RawModel[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];

  const body = (await res.json()) as { data?: Array<{ id: string }> };
  return (body.data ?? [])
    .filter((m) => /^(gpt-|o[0-9]|chatgpt)/i.test(m.id))
    .map((m) => ({
      gateway: "openai" as const,
      modelId: m.id,
      name: m.id,
    }));
}

async function fetchGoogleModels(): Promise<RawModel[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return [];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    { next: { revalidate: 900 } },
  );
  if (!res.ok) return [];

  const body = (await res.json()) as {
    models?: Array<{
      name: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  return (body.models ?? [])
    .filter((m) =>
      (m.supportedGenerationMethods ?? []).some((method) =>
        method.toLowerCase().includes("generatecontent"),
      ),
    )
    .map((m) => ({
      gateway: "google" as const,
      modelId: m.name.replace(/^models\//, ""),
      name: m.displayName ?? m.name,
      supportedMethods: m.supportedGenerationMethods ?? null,
    }));
}

async function fetchDeepSeekModels(): Promise<RawModel[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return [];

  const res = await fetch("https://api.deepseek.com/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];

  const body = (await res.json()) as { data?: Array<{ id: string }> };
  return (body.data ?? []).map((m) => ({
    gateway: "deepseek" as const,
    modelId: m.id,
    name: m.id,
  }));
}
