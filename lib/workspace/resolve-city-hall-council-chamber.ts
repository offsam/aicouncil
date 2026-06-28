import type { ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";
import type { CostTier } from "@/lib/cost-tier";
import { COST_TIER_LABEL, isCostTier } from "@/lib/cost-tier";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isCityHallBuilding,
  resolveCanonicalCityHallBuilding,
} from "./city-hall-building";

/** @deprecated Legacy single council — migration artifact, not used for debate routing. */
export const CITY_COUNCIL_CHAMBER_SLUG = "city-council";
/** @deprecated Legacy single council — migration artifact, not used for debate routing. */
export const CITY_COUNCIL_CHAMBER_NAME = "Совет города";

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

export type LegacyCityCouncilChamber = {
  chamberId: string;
  chamberRegistryId: string;
  name: string;
  slug: string;
  agentCount: number;
};

export type CityHallDebateChamberResolution = {
  byTier: CityHallDebateChambersByTier;
  legacyCouncil: LegacyCityCouncilChamber | null;
};

function isLegacyCouncil(name: string | null | undefined, slug: string | null | undefined): boolean {
  const n = name?.trim();
  const s = slug?.trim();
  return s === CITY_COUNCIL_CHAMBER_SLUG || n === CITY_COUNCIL_CHAMBER_NAME;
}

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

/**
 * Resolves four tier-isolated debate chambers in City Hall (free / $ / $$ / $$$).
 * Does not use legacy «Совет города» (slug city-council).
 */
export async function resolveCityHallDebateChambersByTier(
  officeId: string = AI_COUNCIL_OFFICE_ID,
): Promise<CityHallDebateChamberResolution> {
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
  let legacyCouncil: LegacyCityCouncilChamber | null = null;

  if (!cityHall) {
    return { byTier, legacyCouncil };
  }

  const cityHallChambers = chambers.filter(
    (c) => c.building_object_id === cityHall.id || c.building_entity_id === cityHall.id,
  );

  const registryIds = cityHallChambers.map((c) => c.entity_registry_id).filter(Boolean);
  const { data: registryRows } = registryIds.length
    ? await supabase.from("entity_registry").select("id, name, slug").in("id", registryIds)
    : { data: [] as Array<{ id: string; name: string; slug: string | null }> };

  const slugByRegistryId = new Map((registryRows ?? []).map((r) => [r.id, r.slug]));

  for (const chamber of cityHallChambers) {
    const slug = slugByRegistryId.get(chamber.entity_registry_id) ?? null;
    if (isLegacyCouncil(chamber.name, slug)) {
      const { count } = await supabase
        .from("agent_assignments")
        .select("id", { count: "exact", head: true })
        .eq("chamber_id", chamber.id);
      legacyCouncil = {
        chamberId: chamber.id,
        chamberRegistryId: chamber.entity_registry_id,
        name: chamber.name,
        slug: slug ?? CITY_COUNCIL_CHAMBER_SLUG,
        agentCount: count ?? 0,
      };
      continue;
    }
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

  return { byTier, legacyCouncil };
}

export async function resolveCityHallDebateChamber(
  tier: CostTier,
  officeId: string = AI_COUNCIL_OFFICE_ID,
): Promise<CityHallDebateChamber | null> {
  const { byTier } = await resolveCityHallDebateChambersByTier(officeId);
  return byTier[tier] ?? null;
}

/** @deprecated Use resolveCityHallDebateChamber(tier). Returns null — legacy council is not debate target. */
export async function resolveCityHallCouncilChamber(
  officeId: string = AI_COUNCIL_OFFICE_ID,
): Promise<{
  chamberId: string;
  chamberRegistryId: string;
  name: string;
} | null> {
  void officeId;
  return null;
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
