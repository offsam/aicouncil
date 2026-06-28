import { FLOOR_GRID, snapFloorCoord } from "./floor-grid";

export const WALL_MIN_STROKE = FLOOR_GRID;
/** Длина «призрака» у курсора до начала рисования */
export const WALL_CURSOR_LENGTH = FLOOR_GRID;
export const WALL_THICKNESS = 0.12;

export interface WallStrokePlacement {
  x: number;
  z: number;
  rotationY: number;
  length: number;
}

/** @deprecated use WallStrokePlacement */
export interface WallSegmentPlacement {
  x: number;
  z: number;
  rotationY: number;
}

export function strokeAngle(x1: number, z1: number, x2: number, z2: number) {
  return Math.atan2(z2 - z1, x2 - x1);
}

export function strokeLength(x1: number, z1: number, x2: number, z2: number) {
  return Math.hypot(x2 - x1, z2 - z1);
}

export function snapWallAngle(angle: number, freeAngle: boolean): number {
  if (freeAngle) return angle;
  const quarter = Math.PI / 2;
  return Math.round(angle / quarter) * quarter;
}

/** Привязка конца штриха к горизонтали/вертикали сетки (как в Sims) */
export function snapWallEndPoint(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  freeAngle: boolean,
): { x: number; z: number } {
  const sx = snapFloorCoord(startX);
  const sz = snapFloorCoord(startZ);
  let ex = snapFloorCoord(endX);
  let ez = snapFloorCoord(endZ);

  if (!freeAngle) {
    const dx = ex - sx;
    const dz = ez - sz;
    if (Math.abs(dx) >= Math.abs(dz)) {
      ez = sz;
    } else {
      ex = sx;
    }
  }

  return { x: ex, z: ez };
}

export function wallStrokeFromDrag(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  freeAngle: boolean,
): WallStrokePlacement | null {
  const startX = snapFloorCoord(x1);
  const startZ = snapFloorCoord(z1);
  const end = snapWallEndPoint(startX, startZ, x2, z2, freeAngle);
  const dx = end.x - startX;
  const dz = end.z - startZ;
  const len = Math.hypot(dx, dz);

  if (len < WALL_MIN_STROKE) return null;

  const rotationY = snapWallAngle(strokeAngle(startX, startZ, end.x, end.z), freeAngle);

  return {
    x: (startX + end.x) / 2,
    z: (startZ + end.z) / 2,
    rotationY,
    length: len,
  };
}

export function wallPreviewAtCursor(
  x: number,
  z: number,
  rotationY: number,
) {
  return {
    x: snapFloorCoord(x),
    z: snapFloorCoord(z),
    rotationY,
    length: WALL_CURSOR_LENGTH,
  };
}

/** Конец штриха при перетаскивании — ось без привязки конца к сетке (живое превью). */
export function wallLiveEndFromDrag(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  freeAngle: boolean,
): { x: number; z: number } {
  const sx = snapFloorCoord(startX);
  const sz = snapFloorCoord(startZ);
  if (freeAngle) return { x: endX, z: endZ };
  const dx = endX - sx;
  const dz = endZ - sz;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return { x: endX, z: sz };
  }
  return { x: sx, z: endZ };
}

export function wallPreviewForStroke(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  freeAngle: boolean,
  cursorRotationY = 0,
) {
  const stroke = wallStrokeFromDrag(x1, z1, x2, z2, freeAngle);
  if (stroke) return stroke;

  const startX = snapFloorCoord(x1);
  const startZ = snapFloorCoord(z1);
  const end = wallLiveEndFromDrag(startX, startZ, x2, z2, freeAngle);
  const len = strokeLength(startX, startZ, end.x, end.z);

  if (len < 1e-3) {
    return {
      x: startX,
      z: startZ,
      rotationY: cursorRotationY,
      length: WALL_MIN_STROKE,
    };
  }

  return {
    x: (startX + end.x) / 2,
    z: (startZ + end.z) / 2,
    rotationY: snapWallAngle(strokeAngle(startX, startZ, end.x, end.z), freeAngle),
    length: Math.max(WALL_MIN_STROKE * 0.2, len),
  };
}

/** Ориентация превью у курсора — вдоль «горизонтали экрана» на полу */
export function wallCursorRotationFromCamera(
  cameraMatrix: { elements: number[] | Float32Array },
) {
  const rx = cameraMatrix.elements[0];
  const rz = cameraMatrix.elements[2];
  const len = Math.hypot(rx, rz);
  if (len < 1e-6) return 0;
  const angle = Math.atan2(rz / len, rx / len);
  return snapWallAngle(angle, false);
}
