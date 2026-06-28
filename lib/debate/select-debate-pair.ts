import { selectAgentsForChamberEntity, type SelectedAgent } from "@/lib/agent-selection";
import type { CostTier } from "@/lib/cost-tier";
import { COST_TIER_ORDER } from "@/lib/cost-tier";

export type DebatePair = {
  author: SelectedAgent;
  reviewer: SelectedAgent;
};

function pickTwoAgents(candidates: SelectedAgent[]): DebatePair {
  if (candidates.length < 2) {
    throw new Error("Для спора нужно минимум 2 агента в выбранном отделе");
  }
  const sorted = [...candidates].sort(
    (a, b) =>
      COST_TIER_ORDER[a.costTier] - COST_TIER_ORDER[b.costTier] ||
      a.slug.localeCompare(b.slug),
  );
  const author = sorted[0];
  const reviewer = sorted[sorted.length - 1];
  if (author.agentId === reviewer.agentId) {
    throw new Error("Не удалось подобрать двух разных агентов для спора");
  }
  return { author, reviewer };
}

/**
 * Pick author + reviewer from a single tier-isolated City Hall debate chamber.
 */
export async function selectDebatePair(
  debateChamberRegistryId: string,
  tier: CostTier,
): Promise<DebatePair> {
  const roster = await selectAgentsForChamberEntity(debateChamberRegistryId, 0, {
    rosterOnly: true,
  });
  const sameTier = roster.filter((agent) => agent.costTier === tier);
  if (sameTier.length < 2) {
    throw new Error(
      `В отделе для tier «${tier}» нужно минимум 2 агента уровня ${tier}, найдено ${sameTier.length}`,
    );
  }
  return pickTwoAgents(sameTier);
}
