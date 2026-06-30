import { normalizeCostTier, type CostTier } from "./cost-tier";
import type { ExecutionMode } from "./execution-mode";

/** Single source of truth: which cost tiers may participate per execution mode. */
export const EXECUTION_MODE_ALLOWED_TIERS: Record<ExecutionMode, readonly CostTier[]> = {
  fast: ["free"],
  team: ["free", "cheap"],
  council: ["free", "cheap", "mid"],
  turbo: ["free", "cheap", "mid", "premium"],
};

const EXECUTION_MODE_REQUIRED_TIER: Record<Exclude<ExecutionMode, "turbo">, CostTier> = {
  fast: "free",
  team: "cheap",
  council: "mid",
};

/** Canvas ceiling labels (legacy alias — last allowed tier per mode). */
export const EXECUTION_MODE_MAX_ACTIVE_TIER: Record<ExecutionMode, CostTier> = {
  fast: "free",
  team: "cheap",
  council: "mid",
  turbo: "premium",
};

export function getAllowedTiersForExecutionMode(mode: ExecutionMode): readonly CostTier[] {
  return EXECUTION_MODE_ALLOWED_TIERS[mode];
}

export function isCostTierAllowedForExecutionMode(
  tier: CostTier | string | null | undefined,
  mode: ExecutionMode,
): boolean {
  const normalized = normalizeCostTier(tier);
  return getAllowedTiersForExecutionMode(mode).includes(normalized);
}

/**
 * Minimum tier that must exist in roster for fast/team/council to run.
 * Turbo: null — any allowed tier suffices; empty roster is the only hard failure.
 */
export function getRequiredTierForExecutionMode(mode: ExecutionMode): CostTier | null {
  if (mode === "turbo") return null;
  return EXECUTION_MODE_REQUIRED_TIER[mode];
}

/** @deprecated Use isCostTierAllowedForExecutionMode — kept for existing imports. */
export function isCostTierActiveForExecutionMode(
  tier: CostTier | string | null | undefined,
  mode: ExecutionMode,
): boolean {
  return isCostTierAllowedForExecutionMode(tier, mode);
}

/** Resolve execution mode when legacy `turbo: true` is passed alongside an older mode. */
export function resolveExecutionModeWithLegacyTurbo(
  mode: ExecutionMode,
  legacyTurbo?: boolean,
): ExecutionMode {
  if (legacyTurbo) return "turbo";
  return mode;
}
