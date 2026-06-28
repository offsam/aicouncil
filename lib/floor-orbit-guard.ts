import type { Object3D } from "three";

export const ORBIT_PAUSE_TARGET = "orbitPauseTarget";

export function markOrbitPauseTarget(obj: Object3D) {
  obj.userData[ORBIT_PAUSE_TARGET] = true;
}

export function isOrbitPauseTarget(obj: Object3D | null | undefined): boolean {
  let current: Object3D | null | undefined = obj;
  while (current) {
    if (current.userData[ORBIT_PAUSE_TARGET]) return true;
    current = current.parent;
  }
  return false;
}
