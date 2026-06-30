import { normalizeCostTier, type CostTier } from "@/lib/cost-tier";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireCityHallBuildingId } from "./graph-identity-required";

export type CityWideTierCounts = Record<CostTier, number>;

export type CityWideTierCountsResult = {
  tierCounts: CityWideTierCounts;
  /** Resolved via graph identity (building_role), not hardcoded. */
  excludedCityHallBuildingId: string;
};

function emptyTierCounts(): CityWideTierCounts {
  return { free: 0, cheap: 0, mid: 0, premium: 0 };
}

function isCityHallChamber(
  chamber: { building_entity_id: string | null; building_object_id: string | null },
  cityHallBuildingId: string,
): boolean {
  return (
    chamber.building_entity_id === cityHallBuildingId ||
    chamber.building_object_id === cityHallBuildingId
  );
}

/**
 * City-wide agent tier counts for execution-mode gates (EXEC-MODE-ADR-1).
 *
 * Equivalent SQL (City Hall id from requireCityHallBuildingId):
 *
 *   SELECT a.cost_tier, COUNT(*)::int AS cnt
 *   FROM agent_assignments aa
 *   JOIN chambers c ON c.id = aa.chamber_id
 *   JOIN agents a ON a.id = aa.agent_id
 *   JOIN office_objects oo ON oo.id = c.building_object_id
 *   WHERE oo.office_id = :officeId
 *     AND oo.object_type = 'room'
 *     AND NOT (
 *       c.building_entity_id = :cityHallBuildingId
 *       OR c.building_object_id = :cityHallBuildingId
 *     )
 *   GROUP BY a.cost_tier;
 */
export async function resolveCityWideTierCountsExcludingCityHall(
  officeId: string,
): Promise<CityWideTierCountsResult> {
  const excludedCityHallBuildingId = await requireCityHallBuildingId(officeId);
  const supabase = getSupabaseAdmin();

  const { data: officeRooms, error: roomsError } = await supabase
    .from("office_objects")
    .select("id")
    .eq("office_id", officeId)
    .eq("object_type", "room");

  if (roomsError) {
    throw new Error(roomsError.message);
  }

  const officeRoomIds = new Set((officeRooms ?? []).map((row) => row.id));
  if (officeRoomIds.size === 0) {
    return { tierCounts: emptyTierCounts(), excludedCityHallBuildingId };
  }

  const { data: assignments, error: assignError } = await supabase
    .from("agent_assignments")
    .select(
      "agents!inner(cost_tier), chambers!inner(building_entity_id, building_object_id)",
    );

  if (assignError) {
    throw new Error(assignError.message);
  }

  const tierCounts = emptyTierCounts();

  for (const row of assignments ?? []) {
    const chamber = row.chambers as {
      building_entity_id: string | null;
      building_object_id: string | null;
    };
    const buildingObjectId = chamber.building_object_id;
    if (!buildingObjectId || !officeRoomIds.has(buildingObjectId)) {
      continue;
    }
    if (isCityHallChamber(chamber, excludedCityHallBuildingId)) {
      continue;
    }
    const tier = normalizeCostTier(
      (row.agents as { cost_tier?: string | null }).cost_tier,
    );
    tierCounts[tier] += 1;
  }

  return { tierCounts, excludedCityHallBuildingId };
}
