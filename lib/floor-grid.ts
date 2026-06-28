/** Шаг сетки для полов и помещений (как «пиксели») */
export const FLOOR_GRID = 1;

export function snapFloorCoord(value: number): number {
  return Math.round(value / FLOOR_GRID) * FLOOR_GRID;
}

export interface SnappedRect {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function rectFromDrag(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): SnappedRect {
  const sx1 = snapFloorCoord(x1);
  const sz1 = snapFloorCoord(z1);
  const sx2 = snapFloorCoord(x2);
  const sz2 = snapFloorCoord(z2);

  let minX = Math.min(sx1, sx2);
  let maxX = Math.max(sx1, sx2);
  let minZ = Math.min(sz1, sz2);
  let maxZ = Math.max(sz1, sz2);

  if (maxX - minX < FLOOR_GRID) maxX = minX + FLOOR_GRID;
  if (maxZ - minZ < FLOOR_GRID) maxZ = minZ + FLOOR_GRID;

  const width = maxX - minX;
  const depth = maxZ - minZ;

  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width,
    depth,
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

export const ROOM_MIN_STROKE = FLOOR_GRID;

/** Один «пиксель» сетки у курсора до начала рисования */
export function roomPreviewAtCursor(x: number, z: number): SnappedRect {
  return rectFromDrag(x, z, x, z);
}
