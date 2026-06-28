import type { ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import {
  DEFAULT_CITY_HALL,
  WORKSPACE_UNIT_PX,
  type CityHallLayout,
  type WorkspaceMeta,
} from "./constants";
import { flowNodeToBuildingCenter } from "./coords";

export const CITY_HALL_BUILDING_LABEL = "City Hall";

export function isCityHallBuilding(row: Pick<OfficeObjectRow, "label">): boolean {
  return row.label?.trim() === CITY_HALL_BUILDING_LABEL;
}

function chamberCountForBuilding(buildingId: string, chambers: ChamberRow[]): number {
  return chambers.filter(
    (c) => c.building_object_id === buildingId || c.building_entity_id === buildingId,
  ).length;
}

/** One City Hall on canvas — prefer the building that actually has departments. */
export function resolveCanonicalCityHallBuilding(
  buildings: OfficeObjectRow[],
  chambers: ChamberRow[] = [],
): OfficeObjectRow | null {
  const cityHalls = buildings.filter(isCityHallBuilding);
  if (cityHalls.length === 0) return null;
  if (cityHalls.length === 1) return cityHalls[0];

  return [...cityHalls].sort((a, b) => {
    const chamberDelta =
      chamberCountForBuilding(b.id, chambers) - chamberCountForBuilding(a.id, chambers);
    if (chamberDelta !== 0) return chamberDelta;
    const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
    const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
    return aCreated - bCreated;
  })[0];
}

export function resolveCityHallBuildingId(
  buildings: OfficeObjectRow[],
  chambers: ChamberRow[] = [],
): string | null {
  return resolveCanonicalCityHallBuilding(buildings, chambers)?.id ?? null;
}

/** Hide duplicate empty City Hall objects — they reset the viewport layout on reload. */
export function buildingsForWorkspaceCanvas(
  buildings: OfficeObjectRow[],
  chambers: ChamberRow[],
): OfficeObjectRow[] {
  const canonical = resolveCanonicalCityHallBuilding(buildings, chambers);
  if (!canonical) return buildings;
  return buildings.filter((b) => !isCityHallBuilding(b) || b.id === canonical.id);
}

/** Chambers whose parent building is actually rendered on the workspace canvas. */
export function chambersOnWorkspaceCanvas(
  chambers: ChamberRow[],
  buildings: OfficeObjectRow[],
): ChamberRow[] {
  const buildingIds = new Set(buildings.map((building) => building.id));
  return chambers.filter(
    (chamber) =>
      (chamber.building_object_id != null && buildingIds.has(chamber.building_object_id)) ||
      (chamber.building_entity_id != null && buildingIds.has(chamber.building_entity_id)),
  );
}

export function chamberRegistryId(chamber: ChamberRow): string {
  return chamber.entity_registry_id || chamber.id;
}

export function resolveCityHallLayout(meta: WorkspaceMeta): CityHallLayout {
  const ch = meta.city_hall;
  if (
    ch &&
    typeof ch.x === "number" &&
    typeof ch.y === "number" &&
    typeof ch.width === "number" &&
    typeof ch.height === "number"
  ) {
    return ch;
  }
  return { ...DEFAULT_CITY_HALL };
}

/** Flow layout for a new City Hall building object (world units + px). */
export function cityHallObjectPayload(meta: WorkspaceMeta): {
  position_x: number;
  position_z: number;
  size_w: number;
  size_d: number;
} {
  const layout = resolveCityHallLayout(meta);
  const center = flowNodeToBuildingCenter(layout.x, layout.y, layout.width, layout.height);
  return {
    ...center,
    size_w: Math.max(10, layout.width / WORKSPACE_UNIT_PX),
    size_d: Math.max(8, layout.height / WORKSPACE_UNIT_PX),
  };
}
