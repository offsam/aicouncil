import { FLOOR_GRID, snapFloorCoord } from "./floor-grid";
import { WALL_MIN_STROKE } from "./wall-draw";

export interface WallSegment {
  x: number;
  z: number;
  rotationY: number;
  length: number;
}

/** Удалить один «пиксель» сетки из стены; вернуть оставшиеся сегменты (0–2). */
export function wallSegmentsAfterErase(
  centerX: number,
  centerZ: number,
  rotationY: number,
  length: number,
  hitX: number,
  hitZ: number,
): WallSegment[] {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const dx = hitX - centerX;
  const dz = hitZ - centerZ;
  const localX = dx * cos + dz * sin;
  const half = length / 2;
  const eraseCenter = snapFloorCoord(localX);
  const eraseMin = eraseCenter - FLOOR_GRID / 2;
  const eraseMax = eraseCenter + FLOOR_GRID / 2;

  const parts: Array<{ start: number; end: number }> = [];
  if (-half < eraseMin) parts.push({ start: -half, end: Math.min(eraseMin, half) });
  if (eraseMax < half) parts.push({ start: Math.max(eraseMax, -half), end: half });

  const segments: WallSegment[] = [];
  for (const part of parts) {
    const segLen = part.end - part.start;
    if (segLen < WALL_MIN_STROKE) continue;
    const midLocal = (part.start + part.end) / 2;
    segments.push({
      x: centerX + midLocal * cos,
      z: centerZ + midLocal * sin,
      rotationY,
      length: segLen,
    });
  }
  return segments;
}

/** Точка на оси стены для превью сноса (центр удаляемой ячейки). */
export function wallErasePreviewPoint(
  centerX: number,
  centerZ: number,
  rotationY: number,
  length: number,
  hitX: number,
  hitZ: number,
): { x: number; z: number } {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const localX = (hitX - centerX) * cos + (hitZ - centerZ) * sin;
  const eraseCenter = snapFloorCoord(localX);
  return {
    x: centerX + eraseCenter * cos,
    z: centerZ + eraseCenter * sin,
  };
}
