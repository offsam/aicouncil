import type { CostTier } from "@/lib/cost-tier";

export type MayorTierCounts = Record<CostTier, number>;

/** Team/Council gates for Mayor chat — use City Hall tier pools, not the main chamber roster. */
export function mayorExecutionEligibility(tierCounts: MayorTierCounts | null | undefined): {
  teamEligible: boolean;
  councilEligible: boolean;
} {
  if (!tierCounts) {
    return { teamEligible: true, councilEligible: true };
  }
  return {
    teamEligible: tierCounts.cheap > 0,
    councilEligible: tierCounts.mid > 0,
  };
}
