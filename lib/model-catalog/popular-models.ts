import type { CatalogModel, ModelSpecialization } from "./types";

/** Max highlighted tiles per category block — keeps «popular» readable. */
export const MAX_FEATURED_MODELS_PER_CATEGORY = 8;

type PopularRule = {
  /** Lower = higher in the list within a category. */
  order: number;
  pattern: RegExp;
};

/** Curated top picks per specialization (matched against modelId + displayName). */
const POPULAR_BY_SPEC: Record<ModelSpecialization, PopularRule[]> = {
  code: [
    { order: 1, pattern: /\bqwen3-coder\b|\bqwen\/qwen3-coder\b/i },
    { order: 2, pattern: /\bcodestral\b/i },
    { order: 3, pattern: /\bdevstral\b/i },
    { order: 4, pattern: /\bgpt-5(?:\.\d+)?-codex\b/i },
    { order: 5, pattern: /\bdeepseek-coder\b/i },
    { order: 6, pattern: /\bkimi-k2(?:\.\d+)?-code\b/i },
  ],
  analysis: [
    { order: 1, pattern: /\b(?:openai\/)?o3(?:-mini|-pro|-deep-research)?(?:-\d{4}|$|\b)/i },
    { order: 2, pattern: /\b(?:openai\/)?o4-mini\b/i },
    { order: 3, pattern: /\bdeepseek(?:\/|-)?r1\b|\bdeepseek-reasoner\b|\bor-deepseek-r1\b/i },
    { order: 4, pattern: /\bclaude-opus-4(?:\.\d+|-\d)\b/i },
    { order: 5, pattern: /\bgpt-5(?:\.\d+)?-pro\b/i },
    { order: 6, pattern: /\bgemini-(?:2\.5|3(?:\.\d+)?)-pro\b/i },
  ],
  text: [
    { order: 1, pattern: /\bclaude-sonnet-4(?:\.\d+|-6)\b|\bclaude-sonnet-4-6\b/i },
    { order: 2, pattern: /\bclaude-haiku-4(?:\.\d+|-5)\b|\bclaude-haiku-4-5\b/i },
    { order: 3, pattern: /\bgpt-5(?:\.\d+)?(?:-chat(?:-latest)?|-\d{4})?\b/i },
    { order: 4, pattern: /\bgpt-4o(?:-mini)?\b/i },
    { order: 5, pattern: /\bgemini-(?:2\.5|3(?:\.\d+)?)-flash\b/i },
    { order: 6, pattern: /\bgrok-4(?:\.\d+|-3)\b/i },
    { order: 7, pattern: /\bmistral-(?:large|medium)-\d/i },
    { order: 8, pattern: /\bdeepseek-chat\b|\bdeepseek-v3\b/i },
  ],
  image: [
    { order: 1, pattern: /\bgpt-image(?:-1|-2)?\b|\bdall-e-3\b/i },
    { order: 2, pattern: /\bnano-banana\b|\bgemini-(?:2\.5|3(?:\.\d+)?)-flash-image\b/i },
    { order: 3, pattern: /\bgemini-3-pro-image\b|\bflux\b/i },
  ],
  video: [
    { order: 1, pattern: /\bsora\b|\bveo-?\d\b|\bseedance\b/i },
    { order: 2, pattern: /\brunway\b|\bkling\b/i },
  ],
  audio: [
    { order: 1, pattern: /\bwhisper-1\b|\bwhisper\b/i },
    { order: 2, pattern: /\bgpt-4o-mini-tts\b|\bgpt-audio\b/i },
    { order: 3, pattern: /\bgemini-.*tts\b/i },
  ],
  general: [
    { order: 1, pattern: /\bgpt-4o\b|\bclaude-sonnet-4\b|\bgemini-.*flash\b/i },
    { order: 2, pattern: /\bgemma-4-(?:26|31)b\b/i },
    { order: 3, pattern: /\bgroq\/compound\b/i },
  ],
};

const GATEWAY_RANK: Record<CatalogModel["gateway"], number> = {
  anthropic: 0,
  openai: 1,
  google: 2,
  groq: 3,
  deepseek: 4,
  openrouter: 9,
};

function modelHaystack(model: CatalogModel): string {
  return `${model.modelId} ${model.displayName} ${model.originProvider}`.toLowerCase();
}

/** Returns popularity order (1-based rank) or null if not featured. */
export function getCatalogModelPopularOrder(model: CatalogModel): number | null {
  const hay = modelHaystack(model);
  const rules = POPULAR_BY_SPEC[model.primarySpecialization] ?? [];
  let best: number | null = null;
  for (const rule of rules) {
    if (!rule.pattern.test(hay)) continue;
    best = best === null ? rule.order : Math.min(best, rule.order);
  }
  return best;
}

export function isCatalogModelFeatured(model: CatalogModel): boolean {
  return getCatalogModelPopularOrder(model) !== null;
}

function compareCatalogModelsForDisplay(a: CatalogModel, b: CatalogModel): number {
  const orderA = getCatalogModelPopularOrder(a);
  const orderB = getCatalogModelPopularOrder(b);

  if (orderA !== null && orderB !== null) {
    if (orderA !== orderB) return orderA - orderB;
    const gw = (GATEWAY_RANK[a.gateway] ?? 5) - (GATEWAY_RANK[b.gateway] ?? 5);
    if (gw !== 0) return gw;
    return a.displayName.localeCompare(b.displayName, "ru");
  }
  if (orderA !== null) return -1;
  if (orderB !== null) return 1;
  return a.displayName.localeCompare(b.displayName, "ru");
}

export function sortCatalogModelsForDisplay(models: CatalogModel[]): CatalogModel[] {
  return [...models].sort(compareCatalogModelsForDisplay);
}

export function splitCatalogModelsByFeatured(models: CatalogModel[]): {
  featured: CatalogModel[];
  rest: CatalogModel[];
} {
  const sorted = sortCatalogModelsForDisplay(models);
  const featured: CatalogModel[] = [];
  const rest: CatalogModel[] = [];
  for (const model of sorted) {
    if (featured.length < MAX_FEATURED_MODELS_PER_CATEGORY && isCatalogModelFeatured(model)) {
      featured.push(model);
    } else {
      rest.push(model);
    }
  }
  return { featured, rest };
}
