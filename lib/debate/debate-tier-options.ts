import type { CostTier } from "@/lib/cost-tier";
import { COST_TIER_LABEL, COST_TIER_LABEL_RU } from "@/lib/cost-tier";
import type { CityHallDebateChamber } from "@/lib/workspace/resolve-city-hall-council-chamber";
import { debateTierMode, type DebateTierMode } from "./types";

export type DebateTierOption = {
  tier: CostTier;
  label: string;
  chamberLabel: string;
  hint: string;
  tierMode: DebateTierMode;
  minAgents: number;
};

export const DEBATE_ISOLATED_TIERS: CostTier[] = ["free", "cheap", "mid", "premium"];

export function buildDebateTierOptions(
  chambersByTier: Partial<Record<CostTier, Pick<CityHallDebateChamber, "name" | "agentCount">>>,
): DebateTierOption[] {
  return DEBATE_ISOLATED_TIERS.map((tier) => {
    const chamber = chambersByTier[tier];
    const chamberLabel = chamber?.name ?? COST_TIER_LABEL[tier];
    return {
      tier,
      label: COST_TIER_LABEL_RU[tier],
      chamberLabel,
      hint: `Отдел «${chamberLabel}» · только ${COST_TIER_LABEL_RU[tier]}`,
      tierMode: debateTierMode(tier),
      minAgents: 2,
    };
  });
}

export function debateOptionEligible(
  option: DebateTierOption,
  tierCounts: Record<CostTier, number>,
): boolean {
  return tierCounts[option.tier] >= option.minAgents;
}
