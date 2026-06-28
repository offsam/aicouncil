import type { OfficeObjectType } from "./office-types";
import { isLandscapePlantType } from "./landscape-plants";

/** Объекты процесса — кликабельны в обычном режиме просмотра. */
export function isProcessObjectType(type: OfficeObjectType): boolean {
  return type === "desk" || type === "cabinet" || type === "board" || type === "room";
}

/** Декор / застройка — в обычном режиме не перехватывают мышь (orbit проходит сквозь). */
export function isDecorationObjectType(type: OfficeObjectType): boolean {
  return type === "wall" || type === "door" || isLandscapePlantType(type);
}

export interface SceneInteractionFlags {
  deleteMode: boolean;
  moveMode: boolean;
  cableMode: boolean;
  placement: boolean;
  wallDrawActive: boolean;
  roomDrawActive: boolean;
}

export function isObjectPointerInteractive(
  type: OfficeObjectType,
  flags: SceneInteractionFlags,
): boolean {
  if (
    flags.deleteMode ||
    flags.moveMode ||
    flags.cableMode ||
    flags.placement ||
    flags.wallDrawActive ||
    flags.roomDrawActive
  ) {
    return true;
  }
  return isProcessObjectType(type);
}
