export type CostTier = "free" | "cheap" | "mid" | "premium";

export const COST_TIER_ORDER: Record<CostTier, number> = {
  free: 1,
  cheap: 2,
  mid: 3,
  premium: 4,
};

/** Legacy compact symbols (filters, logs). */
export const COST_TIER_LABEL: Record<CostTier, string> = {
  free: "free",
  cheap: "$",
  mid: "$$",
  premium: "$$$",
};

/** Full Russian labels for UI. */
export const COST_TIER_LABEL_RU: Record<CostTier, string> = {
  free: "бесплатный",
  cheap: "дешёвый",
  mid: "средний",
  premium: "премиум",
};

/** Compact Russian labels for badges on the canvas. */
export const COST_TIER_LABEL_RU_SHORT: Record<CostTier, string> = {
  free: "бесплатно",
  cheap: "дешёво",
  mid: "средне",
  premium: "премиум",
};

export function normalizeCostTier(value: string | null | undefined): CostTier {
  const tier = value?.trim().toLowerCase();
  if (tier === "free") return "free";
  if (tier === "cheap") return "cheap";
  if (tier === "mid") return "mid";
  if (tier === "premium" || tier === "expensive") return "premium";
  return "cheap";
}

export function costTierDisplayLabel(
  value: string | null | undefined,
  style: "symbol" | "ru" | "ru-short" = "symbol",
): string {
  const tier = normalizeCostTier(value);
  if (style === "ru") return COST_TIER_LABEL_RU[tier];
  if (style === "ru-short") return COST_TIER_LABEL_RU_SHORT[tier];
  return COST_TIER_LABEL[tier];
}

export function isCostTier(value: unknown): value is CostTier {
  return value === "free" || value === "cheap" || value === "mid" || value === "premium";
}
