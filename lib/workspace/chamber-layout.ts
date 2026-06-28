import { DEFAULT_CHAMBER } from "@/lib/control-defaults";

/** Keep chambers inset from the building neon border (building-local units). */
export const BUILDING_CHAMBER_INSET_UNITS = 0.5;

/** Stagger new chambers inside a building (building-local units). */
export function defaultChamberLocalPosition(existingCount: number): {
  x: number;
  z: number;
  width: number;
  depth: number;
} {
  const { width, depth } = DEFAULT_CHAMBER;
  const col = existingCount % 2;
  const row = Math.floor(existingCount / 2);
  const hGap = 1;
  const vGap = 1;
  const packW = width + hGap;
  const packD = depth + vGap;
  return {
    x: -packW / 2 + col * packW + BUILDING_CHAMBER_INSET_UNITS,
    z: -packD / 2 + row * packD + BUILDING_CHAMBER_INSET_UNITS,
    width,
    depth,
  };
}
