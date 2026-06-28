import type { ChamberRow } from "@/lib/office-types";

/** Chamber count per building id (office_objects.id / entity_registry building id). */
export function countChambersByBuilding(
  chambers: ChamberRow[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of chambers) {
    const bid = c.building_object_id || c.building_entity_id;
    if (!bid) continue;
    counts.set(bid, (counts.get(bid) ?? 0) + 1);
  }
  return counts;
}

export function getBuildingChamberCount(
  counts: Map<string, number>,
  buildingId: string,
): number {
  return counts.get(buildingId) ?? 0;
}
