import type { CostTier } from "@/lib/cost-tier";

export type MayorTierCounts = Record<CostTier, number>;

function tierCountsHaveDebateAgents(tierCounts: MayorTierCounts): boolean {
  return (
    tierCounts.free > 0 ||
    tierCounts.cheap > 0 ||
    tierCounts.mid > 0 ||
    tierCounts.premium > 0
  );
}

/** Team/Council gates — debate tier pools when configured, else main City Hall chamber roster. */
export function mayorExecutionEligibility(
  debateTierCounts: MayorTierCounts | null | undefined,
  mainChamberTierCounts?: MayorTierCounts | null,
): {
  teamEligible: boolean;
  councilEligible: boolean;
} {
  const debate = debateTierCounts ?? null;
  const roster = mainChamberTierCounts ?? null;

  const effective =
    debate && tierCountsHaveDebateAgents(debate)
      ? debate
      : roster && tierCountsHaveDebateAgents(roster)
        ? roster
        : debate ?? roster;

  if (!effective) {
    return { teamEligible: true, councilEligible: true };
  }

  return {
    teamEligible: effective.cheap > 0,
    councilEligible: effective.mid > 0,
  };
}
