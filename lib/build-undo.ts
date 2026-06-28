import type { OfficePaintSettings } from "./floor-paint-storage";
import type { FloorCutoutStore } from "./floor-cutouts-storage";
import type { OfficeLinkRow, OfficeObjectRow } from "./office-types";

export interface BuildSnapshot {
  objects: OfficeObjectRow[];
  officeLinks: OfficeLinkRow[];
  floorCutouts: FloorCutoutStore;
  officePaint: OfficePaintSettings;
}

export const MAX_BUILD_UNDO = 50;

export function cloneBuildSnapshot(
  objects: OfficeObjectRow[],
  officeLinks: OfficeLinkRow[],
  floorCutouts: FloorCutoutStore,
  officePaint: OfficePaintSettings,
): BuildSnapshot {
  return {
    objects: structuredClone(objects),
    officeLinks: structuredClone(officeLinks),
    floorCutouts: structuredClone(floorCutouts),
    officePaint: structuredClone(officePaint),
  };
}
