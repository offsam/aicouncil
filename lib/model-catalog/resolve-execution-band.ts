import type { CostTier } from "@/lib/cost-tier";
import {
  inferCatalogCostTier,
  inferCatalogCostTierWithSource,
  type CatalogBandSource,
} from "./infer-cost-tier";
import type { ModelGateway } from "./types";

export type { CatalogBandSource };

export type PatternTierMatch = {
  tier: CostTier;
  /** Index within TIER_DEFAULT_PATTERNS[tier] (mirrored from default-chamber-roster-picks.ts). */
  patternIndex: number;
};

export type ResolveExecutionBandOptions = {
  promptPrice?: number | null;
  completionPrice?: number | null;
  /** Extra haystack tokens for pattern comparison (e.g. displayName, originProviderSlug). */
  patternHaystackExtra?: string | null;
};

export type ResolveExecutionBandResult = {
  /** Primary band — from inferCatalogCostTier (explicit rules + price/fallback). */
  band: CostTier;
  source: CatalogBandSource;
  gateway: ModelGateway;
  catalogBand: CostTier;
  patternHaystack: string;
  /** All tiers whose mirrored TIER_DEFAULT_PATTERNS matched (0, 1, or many). */
  patternMatches: PatternTierMatch[];
  /** True when catalog band disagrees with pattern tier(s) or patterns are ambiguous. */
  patternDiscrepancy: boolean;
  patternDiscrepancyDetail: string;
};

/**
 * Mirrored from default-chamber-roster-picks.ts `TIER_DEFAULT_PATTERNS` for discrepancy
 * comparison only. Do not edit independently — keep in sync with that file.
 */
export const COMPARISON_TIER_DEFAULT_PATTERNS: Record<CostTier, RegExp[]> = {
  free: [
    /\bgroq\/compound-mini\b|\bcompound-mini\b/i,
    /\bllama-3\.3-70b-versatile\b|\bllama-3\.1-8b\b/i,
    /\bgemma.*:free\b|\bgemma-4.*\bfree\b/i,
    /\bnorth-mini\b|\bcohere.*free\b/i,
    /\bgemini.*flash.*free\b/i,
  ],
  cheap: [
    /\bclaude-haiku-4(?:\.\d+|-5)\b|\bclaude-3-haiku\b/i,
    /\bgpt-4o-mini\b/i,
    /\bgemini-(?:2\.5|3(?:\.\d+)?)-flash\b/i,
    /\bqwen3-coder-30b\b|\bqwen.*coder.*instruct\b/i,
    /\bdeepseek-chat\b|\bdeepseek-v3\b/i,
    /\bmistral-small\b|\bllama-3\.3\b/i,
  ],
  mid: [
    /\bclaude-sonnet-4(?:\.\d+|-6)\b|\bclaude-sonnet-4-6\b/i,
    /\bgpt-4o\b(?!-mini)/i,
    /\bgemini-(?:2\.5|3(?:\.\d+)?)-flash\b/i,
    /\bqwen3-coder\b|\bqwen.*coder\b/i,
    /\bmistral-medium\b|\bgrok-4\b/i,
    /\bdeepseek-chat\b|\bdeepseek-v3\b/i,
  ],
  premium: [
    /\bclaude-opus-4(?:\.\d+|-\d)\b/i,
    /\bgpt-5(?:\.\d+)?(?:-chat|-pro|-\d{4})?\b/i,
    /\bgemini-(?:2\.5|3(?:\.\d+)?)-pro\b/i,
    /\bo3(?:-mini|-pro)?\b|\bo4-mini\b/i,
    /\bqwen3-coder-480\b|\bqwen.*coder\b/i,
  ],
};

const TIER_ORDER: CostTier[] = ["free", "cheap", "mid", "premium"];

export function normalizeProviderToGateway(provider: string): ModelGateway | null {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "anthropic" || normalized === "claude") return "anthropic";
  if (normalized === "openai" || normalized === "gpt") return "openai";
  if (normalized === "google" || normalized === "gemini") return "google";
  if (normalized === "groq") return "groq";
  if (normalized === "deepseek") return "deepseek";
  if (normalized === "openrouter") return "openrouter";
  return null;
}

/** @deprecated alias — use inferCatalogCostTierWithSource from infer-cost-tier.ts */
export function classifyCatalogBandWithSource(input: {
  modelId: string;
  gateway: ModelGateway;
  promptPrice?: number | null;
  completionPrice?: number | null;
}): { band: CostTier; source: CatalogBandSource } {
  return inferCatalogCostTierWithSource(input);
}

export function buildPatternHaystack(
  provider: string,
  modelId: string,
  extra?: string | null,
): string {
  return `${modelId} ${provider}${extra ? ` ${extra}` : ""}`.toLowerCase();
}

export function findPatternTierMatches(haystack: string): PatternTierMatch[] {
  const matches: PatternTierMatch[] = [];
  for (const tier of TIER_ORDER) {
    const patterns = COMPARISON_TIER_DEFAULT_PATTERNS[tier];
    for (let i = 0; i < patterns.length; i += 1) {
      if (patterns[i].test(haystack)) {
        matches.push({ tier, patternIndex: i });
        break;
      }
    }
  }
  return matches;
}

export function assessPatternDiscrepancy(
  catalogBand: CostTier,
  patternMatches: PatternTierMatch[],
): { patternDiscrepancy: boolean; patternDiscrepancyDetail: string } {
  if (patternMatches.length === 0) {
    return {
      patternDiscrepancy: false,
      patternDiscrepancyDetail: "no TIER_DEFAULT_PATTERNS match",
    };
  }

  const matchedTiers = [...new Set(patternMatches.map((m) => m.tier))];

  if (matchedTiers.length > 1) {
    const includesCatalog = matchedTiers.includes(catalogBand);
    return {
      patternDiscrepancy: true,
      patternDiscrepancyDetail: includesCatalog
        ? `ambiguous pattern tiers [${matchedTiers.join(", ")}] all match; catalog=${catalogBand} is one of them but patterns overlap across tiers`
        : `ambiguous pattern tiers [${matchedTiers.join(", ")}] but catalog=${catalogBand}`,
    };
  }

  const patternTier = matchedTiers[0];
  if (patternTier !== catalogBand) {
    return {
      patternDiscrepancy: true,
      patternDiscrepancyDetail: `catalog=${catalogBand} vs pattern tier=${patternTier}`,
    };
  }

  return {
    patternDiscrepancy: false,
    patternDiscrepancyDetail: `catalog and pattern tier agree (${catalogBand})`,
  };
}

/**
 * Classify execution band (free/cheap/mid/premium) for a provider/model pair.
 * Primary band: inferCatalogCostTier. Pattern tiers: mirrored TIER_DEFAULT_PATTERNS
 * for discrepancy reporting only — band is NOT overridden on mismatch.
 */
export function resolveExecutionBand(
  provider: string,
  modelId: string,
  options?: {
    promptPrice?: number | null;
    completionPrice?: number | null;
    patternHaystackExtra?: string | null;
  },
): ResolveExecutionBandResult {
  const gateway = normalizeProviderToGateway(provider);
  if (!gateway) {
    throw new Error(`Unknown provider for execution band: ${provider}`);
  }

  const tierInput = {
    modelId,
    gateway,
    promptPrice: options?.promptPrice,
    completionPrice: options?.completionPrice,
  };

  const catalogBand = inferCatalogCostTier(tierInput);
  const classified = inferCatalogCostTierWithSource(tierInput);
  if (classified.band !== catalogBand) {
    throw new Error(
      `resolveExecutionBand internal drift: inferCatalogCostTierWithSource=${classified.band} inferCatalogCostTier=${catalogBand} for ${gateway}:${modelId}`,
    );
  }

  const patternHaystack = buildPatternHaystack(provider, modelId, options?.patternHaystackExtra);
  const patternMatches = findPatternTierMatches(patternHaystack);
  const discrepancy = assessPatternDiscrepancy(catalogBand, patternMatches);

  return {
    band: catalogBand,
    source: classified.source,
    gateway,
    catalogBand,
    patternHaystack,
    patternMatches,
    patternDiscrepancy: discrepancy.patternDiscrepancy,
    patternDiscrepancyDetail: discrepancy.patternDiscrepancyDetail,
  };
}
