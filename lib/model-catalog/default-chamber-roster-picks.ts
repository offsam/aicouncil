import type { CostTier } from "@/lib/cost-tier";
import type { CatalogModel } from "./types";
import { getCatalogModelPopularOrder } from "./popular-models";

/** Preferred brands for auto-seeding new chambers (lower index = higher priority). */
export const PREFERRED_DEFAULT_BRAND_SLUGS = [
  "anthropic",
  "openai",
  "google",
  "groq",
  "qwen",
  "deepseek",
  "mistralai",
  "mistral",
  "meta-llama",
  "meta",
  "cohere",
] as const;

const BRAND_HINTS: Array<{ slug: (typeof PREFERRED_DEFAULT_BRAND_SLUGS)[number]; pattern: RegExp }> =
  [
    { slug: "anthropic", pattern: /\bclaude\b|\banthropic\b/i },
    { slug: "openai", pattern: /\bgpt\b|\bopenai\b|\bchatgpt\b|\bo[34](?:-mini|-pro)?\b/i },
    { slug: "google", pattern: /\bgemini\b|\bgoogle\b|\bnano-banana\b/i },
    { slug: "groq", pattern: /\bgroq\b|\bcompound\b|\bllama-3\.3\b/i },
    { slug: "qwen", pattern: /\bqwen\b|\balibaba\b/i },
    { slug: "deepseek", pattern: /\bdeepseek\b/i },
    { slug: "mistralai", pattern: /\bmistral\b|\bcodestral\b|\bdevstral\b/i },
    { slug: "meta-llama", pattern: /\bllama\b|\bmeta-llama\b|\bmeta\b/i },
    { slug: "cohere", pattern: /\bcohere\b|\bcommand-r\b/i },
  ];

export const TIER_DEFAULT_PATTERNS: Record<CostTier, RegExp[]> = {
  free: [
    /\bgroq\/compound-mini\b|\bcompound-mini\b/i,
    /\bllama-3\.3-70b-versatile\b|\bllama-3\.1-8b\b/i,
    /\bgemma.*:free\b|\bgemma-4.*\bfree\b/i,
    /\bnorth-mini\b|\bcohere.*free\b/i,
    /\bgemini.*flash.*free\b/i,
    /\bqwen3-coder:free\b/i,
  ],
  cheap: [
    /\bclaude-haiku-4(?:\.\d+|-5)\b|\bclaude-3-haiku\b/i,
    /\bgpt-4o-mini\b/i,
    /\bgemini-(?:2\.5|3(?:\.\d+)?)-flash\b/i,
    /\bqwen3-coder-30b(?:-a3b-instruct)?\b/i,
    /\bqwen3-coder-flash\b/i,
    /\bmistral-small\b/i,
  ],
  mid: [
    /\bclaude-sonnet-4(?:\.\d+|-6)\b|\bclaude-sonnet-4-6\b/i,
    /\bgpt-4o\b(?!-mini)/i,
    /\bmistral-medium\b/i,
    /\bdeepseek-chat\b|\bdeepseek-v3\b/i,
  ],
  premium: [
    /\bclaude-opus-4(?:\.\d+|-\d)\b/i,
    /\bgpt-5(?:\.\d+)?(?:-chat|-pro|-\d{4})?\b/i,
    /\bgemini-(?:2\.5|3(?:\.\d+)?)-pro\b/i,
    /\bo3(?:-mini|-pro)?\b|\bo4-mini\b/i,
    /\bgrok-4(?:\.|-)/i,
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

type AgentHaystack = {
  name: string;
  provider?: string | null;
  model_id?: string | null;
  originProviderSlug?: string | null;
};

function agentHaystack(agent: AgentHaystack): string {
  return `${agent.name} ${agent.provider ?? ""} ${agent.model_id ?? ""} ${agent.originProviderSlug ?? ""}`.toLowerCase();
}

function brandIndexFromHaystack(hay: string): number | null {
  for (let i = 0; i < BRAND_HINTS.length; i += 1) {
    if (BRAND_HINTS[i].pattern.test(hay)) {
      const slug = BRAND_HINTS[i].slug;
      const idx = PREFERRED_DEFAULT_BRAND_SLUGS.indexOf(slug);
      return idx >= 0 ? idx : i;
    }
  }
  for (let i = 0; i < PREFERRED_DEFAULT_BRAND_SLUGS.length; i += 1) {
    if (hay.includes(PREFERRED_DEFAULT_BRAND_SLUGS[i])) return i;
  }
  return null;
}

const CHAT_SPECIALIZATIONS = new Set(["text", "general", "code", "analysis"]);

function catalogHaystack(model: CatalogModel): string {
  return `${model.modelId} ${model.displayName} ${model.originProviderSlug} ${model.originProvider}`.toLowerCase();
}

function tierPatternRank(hay: string, tier: CostTier): number | null {
  const patterns = TIER_DEFAULT_PATTERNS[tier];
  for (let i = 0; i < patterns.length; i += 1) {
    if (patterns[i].test(hay)) return i;
  }
  return null;
}

function isChatCatalogModel(model: CatalogModel): boolean {
  return CHAT_SPECIALIZATIONS.has(model.primarySpecialization);
}

/** Lower score = better default pick for a tier. */
export function scoreForDefaultChamberRoster(
  agent: AgentHaystack,
  tier: CostTier,
  catalogModel?: Pick<
    CatalogModel,
    "primarySpecialization" | "gateway" | "originProviderSlug" | "modelId" | "displayName"
  > | null,
): number {
  const hay = catalogModel ? catalogHaystack(catalogModel as CatalogModel) : agentHaystack(agent);
  let score = 10_000;

  if (catalogModel && !isChatCatalogModel(catalogModel as CatalogModel)) {
    return score;
  }

  const tierRank = tierPatternRank(hay, tier);
  if (tierRank !== null) {
    score = Math.min(score, 10 + tierRank);
  }

  let brandIdx = -1;
  if (catalogModel?.originProviderSlug) {
    brandIdx = PREFERRED_DEFAULT_BRAND_SLUGS.indexOf(
      catalogModel.originProviderSlug as (typeof PREFERRED_DEFAULT_BRAND_SLUGS)[number],
    );
  }
  if (brandIdx < 0) {
    const fromHay = brandIndexFromHaystack(hay);
    if (fromHay !== null) brandIdx = fromHay;
  }
  if (brandIdx >= 0) {
    score = Math.min(score, 120 + brandIdx);
  }

  if (catalogModel) {
    const popular = getCatalogModelPopularOrder(catalogModel as CatalogModel);
    if (popular !== null) score = Math.min(score, 180 + popular);
    score += (GATEWAY_RANK[catalogModel.gateway] ?? 5) * 0.01;
  }

  return score;
}

export function pickPreferredPoolAgent<T extends AgentHaystack>(
  agents: T[],
  tier: CostTier,
): T | null {
  if (agents.length === 0) return null;

  const chatLike = agents.filter((agent) => {
    const hay = agentHaystack(agent);
    return !/\b(image|tts|whisper|transcribe|dall-e|flux|sora|veo)\b/i.test(hay);
  });
  const pool = chatLike.length > 0 ? chatLike : agents;

  const tierMatched = pool.filter((agent) => tierPatternRank(agentHaystack(agent), tier) !== null);
  const branded = pool.filter((agent) => brandIndexFromHaystack(agentHaystack(agent)) !== null);
  const candidates =
    tierMatched.length > 0 ? tierMatched : branded.length > 0 ? branded : pool;

  return candidates.reduce((best, candidate) =>
    scoreForDefaultChamberRoster(candidate, tier) < scoreForDefaultChamberRoster(best, tier)
      ? candidate
      : best,
  );
}

export function pickPreferredCatalogModelForTier(
  models: CatalogModel[],
  tier: CostTier,
): CatalogModel | null {
  const tierModels = models.filter(
    (model) => model.costTier === tier && isChatCatalogModel(model),
  );
  if (tierModels.length === 0) return null;

  const tierMatched = tierModels.filter((model) => tierPatternRank(catalogHaystack(model), tier) !== null);
  const branded = tierModels.filter((model) => brandIndexFromHaystack(catalogHaystack(model)) !== null);
  const candidates =
    tierMatched.length > 0 ? tierMatched : branded.length > 0 ? branded : tierModels;

  return candidates.reduce((best, candidate) => {
    const scoreBest = scoreForDefaultChamberRoster(
      {
        name: best.displayName,
        provider: best.gateway,
        model_id: best.modelId,
        originProviderSlug: best.originProviderSlug,
      },
      tier,
      best,
    );
    const scoreCandidate = scoreForDefaultChamberRoster(
      {
        name: candidate.displayName,
        provider: candidate.gateway,
        model_id: candidate.modelId,
        originProviderSlug: candidate.originProviderSlug,
      },
      tier,
      candidate,
    );
    return scoreCandidate < scoreBest ? candidate : best;
  });
}
