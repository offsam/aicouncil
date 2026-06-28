/**
 * Chamber layout coordinates.
 *
 * chambers.x / chambers.z are always building-local offsets from the building
 * footprint center. Use Mode renders the building at world origin (0, 0), so
 * local coords are used directly. City / Communications views add the building's
 * map position (office_objects.position_x/z).
 */

export type ChamberCoords = {
  x: number | string;
  z: number | string;
};

export type BuildingMapPosition = {
  position_x: number | string;
  position_z: number | string;
};

export function getChamberLocalPosition(chamber: ChamberCoords): { x: number; z: number } {
  return { x: Number(chamber.x), z: Number(chamber.z) };
}

export function getBuildingMapPosition(building: BuildingMapPosition): { x: number; z: number } {
  return { x: Number(building.position_x), z: Number(building.position_z) };
}

/**
 * World position on the city map. Pass buildingPosOverride when the building is
 * being dragged (objectPos) instead of its stored position.
 */
export function getChamberWorldPosition(
  building: BuildingMapPosition,
  chamber: ChamberCoords,
  buildingPosOverride?: { x: number; z: number },
): { x: number; z: number } {
  const b = buildingPosOverride ?? getBuildingMapPosition(building);
  const local = getChamberLocalPosition(chamber);
  return { x: b.x + local.x, z: b.z + local.z };
}

export function getChamberWorldPosition3(
  building: BuildingMapPosition,
  chamber: ChamberCoords,
  y: number,
  buildingPosOverride?: { x: number; z: number },
): [number, number, number] {
  const p = getChamberWorldPosition(building, chamber, buildingPosOverride);
  return [p.x, y, p.z];
}

/** True when local offset matches world minus building origin (City ↔ Use invariant). */
export function chamberCityUsePositionsMatch(
  building: BuildingMapPosition,
  chamber: ChamberCoords,
): boolean {
  const local = getChamberLocalPosition(chamber);
  const world = getChamberWorldPosition(building, chamber);
  const b = getBuildingMapPosition(building);
  return world.x - b.x === local.x && world.z - b.z === local.z;
}
