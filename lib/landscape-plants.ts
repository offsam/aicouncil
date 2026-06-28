import type { OfficeObjectType } from "./office-types";

export const LANDSCAPE_PLANT_TYPES = ["tree", "bush", "flower"] as const;
export type LandscapePlantType = (typeof LANDSCAPE_PLANT_TYPES)[number];

export function isLandscapePlantType(type: OfficeObjectType): type is LandscapePlantType {
  return (LANDSCAPE_PLANT_TYPES as readonly string[]).includes(type);
}

export const PLANT_LABELS: Record<LandscapePlantType, string> = {
  tree: "Ель",
  bush: "Куст",
  flower: "Цветы",
};

export const PLANT_DEFAULT_SCALE: Record<LandscapePlantType, number> = {
  tree: 0.34,
  bush: 1,
  flower: 1,
};
