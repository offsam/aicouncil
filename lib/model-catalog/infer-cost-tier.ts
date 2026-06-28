import type { CostTier } from "@/lib/cost-tier";
import type { ModelGateway } from "./types";

type TierInput = {
  modelId: string;
  gateway: ModelGateway;
  promptPrice?: number | null;
  completionPrice?: number | null;
};

export function inferCatalogCostTier(input: TierInput): CostTier {
  const id = input.modelId.toLowerCase();

  if (id.includes(":free") || id.endsWith("-free")) {
    return "free";
  }

  if (
    input.gateway === "groq" &&
    !id.includes("whisper") &&
    !id.includes("guard")
  ) {
    return "free";
  }

  const prompt = input.promptPrice ?? 0;
  const completion = input.completionPrice ?? 0;
  const maxPrice = Math.max(prompt, completion);

  if (maxPrice === 0 && input.gateway === "openrouter") {
    return "free";
  }

  if (
    /\b(opus|o[134]|gpt-4|pro-preview|ultra|405b|235b|120b|gpt-oss-120)\b/.test(id)
  ) {
    return "premium";
  }

  if (
    /\b(haiku|flash-lite|lite|mini|small|8b|7b|1b|1\.2b|nano|free)\b/.test(id)
  ) {
    return "cheap";
  }

  if (maxPrice > 0) {
    if (maxPrice <= 0.0000005) return "cheap";
    if (maxPrice <= 0.000003) return "mid";
    return "premium";
  }

  if (/\b(sonnet|flash|70b|27b|32b|medium|standard)\b/.test(id)) {
    return "mid";
  }

  return "cheap";
}

export function parseOpenRouterPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
