import type { ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";
import type { CostTier } from "@/lib/cost-tier";
import { COST_TIER_LABEL, isCostTier } from "@/lib/cost-tier";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isCityHallBuilding,
  resolveCanonicalCityHallBuilding,
} from "./city-hall-building";

/** Canvas display names for tier-isolated debate chambers in City Hall. */
export const CITY_HALL_DEBATE_CHAMBER_LABEL: Record<CostTier, string> = {
  free: "free",
  cheap: COST_TIER_LABEL.cheap,
  mid: COST_TIER_LABEL.mid,
  premium: COST_TIER_LABEL.premium,
};

const ALL_DEBATE_TIERS: CostTier[] = ["free", "cheap", "mid", "premium"];

export type CityHallDebateChamber = {
  tier: CostTier;
  chamberId: string;
  chamberRegistryId: string;
  name: string;
  agentCount: number;
};

export type CityHallDebateChambersByTier = Partial<Record<CostTier, CityHallDebateChamber>>;

async function countTierAgentsInChamber(chamberId: string, tier: CostTier): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data: assignments } = await supabase
    .from("agent_assignments")
    .select("agent_id, agents(cost_tier)")
    .eq("chamber_id", chamberId);

  return (assignments ?? []).filter((row) => {
    const agentTier = (row.agents as { cost_tier?: string } | null)?.cost_tier;
    return agentTier === tier;
  }).length;
}

/** Resolves four tier-isolated debate chambers in City Hall (free / $ / $$ / $$$). */
export async function resolveCityHallDebateChambersByTier(
  officeId: string = AI_COUNCIL_OFFICE_ID,
): Promise<CityHallDebateChambersByTier> {
  const supabase = getSupabaseAdmin();

  const { data: buildings } = await supabase
    .from("office_objects")
    .select("id, label, created_at")
    .eq("office_id", officeId)
    .eq("object_type", "room");

  const cityHallBuildingIds = (buildings ?? []).filter(isCityHallBuilding).map((b) => b.id);
  let chambers: Array<
    ChamberRow & { name: string; entity_registry_id: string; routing_role: string | null }
  > = [];

  if (cityHallBuildingIds.length > 0) {
    const { data } = await supabase
      .from("chambers")
      .select("id, name, entity_registry_id, building_object_id, building_entity_id, routing_role, created_at")
      .in("building_object_id", cityHallBuildingIds);
    chambers = (data ?? []) as typeof chambers;
  }

  const cityHall = resolveCanonicalCityHallBuilding(
    (buildings ?? []) as OfficeObjectRow[],
    chambers,
  );

  const byTier: CityHallDebateChambersByTier = {};

  if (!cityHall) {
    return byTier;
  }

  const cityHallChambers = chambers.filter(
    (c) => c.building_object_id === cityHall.id || c.building_entity_id === cityHall.id,
  );

  for (const chamber of cityHallChambers) {
    if (chamber.routing_role === "main") continue;

    for (const tier of ALL_DEBATE_TIERS) {
      if (chamber.name?.trim() !== CITY_HALL_DEBATE_CHAMBER_LABEL[tier]) continue;
      const agentCount = await countTierAgentsInChamber(chamber.id, tier);
      byTier[tier] = {
        tier,
        chamberId: chamber.id,
        chamberRegistryId: chamber.entity_registry_id,
        name: chamber.name,
        agentCount,
      };
      break;
    }
  }

  return byTier;
}

export async function resolveCityHallDebateChamber(
  tier: CostTier,
  officeId: string = AI_COUNCIL_OFFICE_ID,
): Promise<CityHallDebateChamber | null> {
  const byTier = await resolveCityHallDebateChambersByTier(officeId);
  return byTier[tier] ?? null;
}

export function debateTierCountsFromChambers(
  byTier: CityHallDebateChambersByTier,
): Record<CostTier, number> {
  return {
    free: byTier.free?.agentCount ?? 0,
    cheap: byTier.cheap?.agentCount ?? 0,
    mid: byTier.mid?.agentCount ?? 0,
    premium: byTier.premium?.agentCount ?? 0,
  };
}

export function isDebateTierConfigured(byTier: CityHallDebateChambersByTier): boolean {
  return ALL_DEBATE_TIERS.every((tier) => (byTier[tier]?.agentCount ?? 0) >= 2);
}

export function parseDebateTierFromMode(value: unknown): CostTier | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (isCostTier(row.tier)) return row.tier;
  if (row.kind === "isolated" && isCostTier(row.tier)) return row.tier;
  return null;
}
