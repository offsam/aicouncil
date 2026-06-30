import type { CostTier } from "@/lib/cost-tier";
import type { ModelGateway } from "./types";

type TierInput = {
  modelId: string;
  gateway: ModelGateway;
  promptPrice?: number | null;
  completionPrice?: number | null;
};

export type CatalogBandSource =
  | "catalog:free_suffix"
  | "catalog:groq_non_whisper"
  | "explicit:llama-3.3-70b-groq"
  | "explicit:claude-opus"
  | "explicit:claude-sonnet"
  | "explicit:claude-haiku"
  | "explicit:gpt-5"
  | "explicit:gpt-4.1"
  | "explicit:gpt-4o"
  | "explicit:gemini-pro"
  | "explicit:gemini-flash"
  | "explicit:deepseek-chat-v3"
  | "explicit:openrouter-free-router"
  | "explicit:gpt-oss-120b"
  | "explicit:qwen3-coder-flash"
  | "explicit:mistral-medium-3.1"
  | "explicit:mistral-small-3.1"
  | "explicit:grok-4"
  | "explicit:claude-fable-latest"
  | "catalog:price_threshold_cheap"
  | "catalog:price_threshold_mid"
  | "catalog:price_threshold_premium"
  | "catalog:default_fallback";

type ExplicitBandRule = {
  source: CatalogBandSource;
  band: CostTier;
  test: (input: TierInput, id: string) => boolean;
};

/** Fixed band assignments — checked before price/fallback heuristics. */
const EXPLICIT_MODEL_BAND_RULES: ExplicitBandRule[] = [
  {
    source: "explicit:llama-3.3-70b-groq",
    band: "free",
    test: (input, id) =>
      input.gateway === "groq" && /\bllama-3\.3-70b-versatile\b/.test(id),
  },
  {
    source: "explicit:claude-opus",
    band: "premium",
    test: (_, id) => /\bclaude-opus/i.test(id),
  },
  {
    source: "explicit:claude-sonnet",
    band: "mid",
    test: (_, id) => /\bclaude-sonnet/i.test(id),
  },
  {
    source: "explicit:claude-haiku",
    band: "cheap",
    test: (_, id) => /\bclaude-haiku/i.test(id),
  },
  {
    source: "explicit:gpt-5",
    band: "premium",
    test: (_, id) => /\bgpt-5/i.test(id),
  },
  {
    source: "explicit:gpt-4.1",
    band: "mid",
    test: (_, id) => /\bgpt-4\.1/i.test(id),
  },
  {
    source: "explicit:gpt-4o",
    band: "mid",
    test: (_, id) => /\bgpt-4o\b(?!-mini)/i.test(id),
  },
  {
    source: "explicit:gemini-pro",
    band: "premium",
    test: (_, id) => /\bgemini-[\d.]+-pro/i.test(id),
  },
  {
    source: "explicit:gemini-flash",
    band: "cheap",
    test: (_, id) => /\bgemini-[\d.]+-flash/i.test(id),
  },
  {
    source: "explicit:deepseek-chat-v3",
    band: "mid",
    test: (_, id) => /\bdeepseek-chat\b|\bdeepseek-v3\b/i.test(id),
  },
  {
    source: "explicit:openrouter-free-router",
    band: "free",
    test: (_, id) => id === "openrouter/free",
  },
  {
    source: "explicit:gpt-oss-120b",
    band: "mid",
    test: (_, id) => /\bgpt-oss-120b\b/i.test(id),
  },
  {
    source: "explicit:qwen3-coder-flash",
    band: "cheap",
    test: (_, id) => /\bqwen3-coder-flash\b/i.test(id),
  },
  {
    source: "explicit:mistral-medium-3.1",
    band: "mid",
    test: (_, id) => /\bmistral-medium-3\.1(?:\b|$|-)/i.test(id),
  },
  {
    source: "explicit:mistral-small-3.1",
    band: "cheap",
    test: (_, id) => /\bmistral-small-3\.1(?:\b|$|-)/i.test(id),
  },
  {
    source: "explicit:grok-4",
    band: "premium",
    test: (_, id) => /\bgrok-4(?:\.|-)/i.test(id),
  },
  {
    source: "explicit:claude-fable-latest",
    band: "premium",
    test: (_, id) => /\bclaude-fable-latest\b/i.test(id),
  },
];

export function inferCatalogCostTierWithSource(
  input: TierInput,
): { band: CostTier; source: CatalogBandSource } {
  const id = input.modelId.toLowerCase();

  if (id.includes(":free") || id.endsWith("-free")) {
    return { band: "free", source: "catalog:free_suffix" };
  }

  if (input.gateway === "groq" && !id.includes("whisper") && !id.includes("guard")) {
    return { band: "free", source: "catalog:groq_non_whisper" };
  }

  for (const rule of EXPLICIT_MODEL_BAND_RULES) {
    if (rule.test(input, id)) {
      return { band: rule.band, source: rule.source };
    }
  }

  const prompt = input.promptPrice ?? 0;
  const completion = input.completionPrice ?? 0;
  const maxPrice = Math.max(prompt, completion);

  // Hard guard: missing/zero price is NOT free unless :free suffix or groq (handled above).
  if (maxPrice > 0) {
    if (maxPrice <= 0.0000005) {
      return { band: "cheap", source: "catalog:price_threshold_cheap" };
    }
    if (maxPrice <= 0.000003) {
      return { band: "mid", source: "catalog:price_threshold_mid" };
    }
    return { band: "premium", source: "catalog:price_threshold_premium" };
  }

  return { band: "cheap", source: "catalog:default_fallback" };
}

export function inferCatalogCostTier(input: TierInput): CostTier {
  return inferCatalogCostTierWithSource(input).band;
}

export function parseOpenRouterPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
