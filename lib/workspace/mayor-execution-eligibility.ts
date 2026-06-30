import type { CostTier } from "@/lib/cost-tier";

export type MayorTierCounts = Record<CostTier, number>;

/** EXEC-MODE-ADR-1: global city-wide gates excluding City Hall. */
export function executionModeEligibilityFromTierCounts(
  tierCounts: MayorTierCounts | null | undefined,
): {
  teamEligible: boolean;
  councilEligible: boolean;
  turboEligible: boolean;
} {
  if (!tierCounts) {
    return { teamEligible: true, councilEligible: true, turboEligible: true };
  }
  return {
    teamEligible: tierCounts.cheap > 0,
    councilEligible: tierCounts.mid > 0,
    turboEligible: tierCounts.premium > 0,
  };
}
