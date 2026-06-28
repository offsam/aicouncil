import type { OfficeObjectType } from "./office-types";
import { isLandscapePlantType } from "./landscape-plants";

/** Стартовая зона «центр города» (AI Council) — визуал в центре карты */
export const OFFICE_ROOM = {
  width: 14,
  depth: 9,
  centerZ: 0.5,
} as const;

/** Рабочая плоскость для размещения всех объектов (~10× прежней) */
export const WORK_FLOOR = {
  width: 220,
  depth: 160,
  centerZ: 0,
  margin: 0.5,
} as const;

/** Травяное поле вокруг площадки */
export const LANDSCAPE = {
  size: 380,
  margin: 2,
} as const;

/** Half-extents (x, z) for bounds checking — без учёта поворота */
export const OBJECT_HALF_SIZES: Record<OfficeObjectType, { hx: number; hz: number }> = {
  desk: { hx: 0.55, hz: 0.4 },
  wall: { hx: 1.0, hz: 0.06 },
  door: { hx: 0.5, hz: 0.06 },
  cabinet: { hx: 0.4, hz: 0.35 },
  board: { hx: 0.8, hz: 0.05 },
  room: { hx: 1, hz: 1 },
  tree: { hx: 0.18, hz: 0.18 },
  bush: { hx: 0.28, hz: 0.28 },
  flower: { hx: 0.12, hz: 0.12 },
};

export function isRotatableObject(type: OfficeObjectType): boolean {
  return type !== "desk" && type !== "room";
}

export function getRotatedHalfExtents(
  objectType: OfficeObjectType,
  rotationY: number,
): { hx: number; hz: number } {
  const { hx, hz } = OBJECT_HALF_SIZES[objectType];
  const c = Math.abs(Math.cos(rotationY));
  const s = Math.abs(Math.sin(rotationY));
  return {
    hx: hx * c + hz * s,
    hz: hx * s + hz * c,
  };
}

export function getWorkFloorBounds() {
  const { width, depth, centerZ, margin } = WORK_FLOOR;
  return {
    minX: -width / 2 + margin,
    maxX: width / 2 - margin,
    minZ: -depth / 2 + centerZ + margin,
    maxZ: depth / 2 + centerZ - margin,
  };
}

export function getLandscapeBounds() {
  const half = LANDSCAPE.size / 2 - LANDSCAPE.margin;
  const cz = WORK_FLOOR.centerZ;
  return {
    minX: -half,
    maxX: half,
    minZ: -half + cz,
    maxZ: half + cz,
  };
}

export function isLandscapePositionInBounds(x: number, z: number): boolean {
  const b = getLandscapeBounds();
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

export function getOfficeBounds() {
  return getWorkFloorBounds();
}

export function isRoomInBounds(
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
): boolean {
  const b = getWorkFloorBounds();
  const hx = width / 2;
  const hz = depth / 2;
  return (
    centerX - hx >= b.minX &&
    centerX + hx <= b.maxX &&
    centerZ - hz >= b.minZ &&
    centerZ + hz <= b.maxZ
  );
}

export function isWallInBounds(
  centerX: number,
  centerZ: number,
  rotationY: number,
  length: number,
): boolean {
  const hx = length / 2;
  const hz = 0.06;
  const c = Math.abs(Math.cos(rotationY));
  const s = Math.abs(Math.sin(rotationY));
  const wx = hx * c + hz * s;
  const wz = hx * s + hz * c;
  const b = getWorkFloorBounds();
  return (
    centerX - wx >= b.minX &&
    centerX + wx <= b.maxX &&
    centerZ - wz >= b.minZ &&
    centerZ + wz <= b.maxZ
  );
}

export function isPositionInBounds(
  x: number,
  z: number,
  objectType: OfficeObjectType,
  rotationY = 0,
  size?: { w: number; d: number },
): boolean {
  if (objectType === "room" && size) {
    return isRoomInBounds(x, z, size.w, size.d);
  }
  if (objectType === "wall" && size?.w) {
    return isWallInBounds(x, z, rotationY, size.w);
  }
  if (isLandscapePlantType(objectType)) {
    const { hx, hz } = getRotatedHalfExtents(objectType, rotationY);
    const b = getLandscapeBounds();
    return (
      x - hx >= b.minX &&
      x + hx <= b.maxX &&
      z - hz >= b.minZ &&
      z + hz <= b.maxZ
    );
  }
  const { hx, hz } = getRotatedHalfExtents(objectType, rotationY);
  const b = getWorkFloorBounds();
  return (
    x - hx >= b.minX &&
    x + hx <= b.maxX &&
    z - hz >= b.minZ &&
    z + hz <= b.maxZ
  );
}

export function isObjectRowInBounds(
  obj: {
    object_type: OfficeObjectType;
    rotation_y: number;
    size_w?: number | null;
    size_d?: number | null;
  },
  x: number,
  z: number,
): boolean {
  if (obj.object_type === "room" && obj.size_w && obj.size_d) {
    return isRoomInBounds(x, z, obj.size_w, obj.size_d);
  }
  if (obj.object_type === "wall" && obj.size_w) {
    return isWallInBounds(x, z, obj.rotation_y, obj.size_w);
  }
  const size =
    obj.object_type === "wall"
      ? { w: obj.size_w ?? 2, d: 0.12 }
      : undefined;
  return isPositionInBounds(x, z, obj.object_type, obj.rotation_y, size);
}

export function getWorkFloorCenter(): { x: number; z: number } {
  return { x: 0, z: WORK_FLOOR.centerZ };
}

/** Точка выхода кабеля из центра города (AI Council) */
export function getHubCableAnchor(): [number, number, number] {
  return [0, 0.35, OFFICE_ROOM.centerZ];
}

export function getRoomCableAnchor(room: {
  position_x: number;
  position_z: number;
}): [number, number, number] {
  return [room.position_x, 0.15, room.position_z];
}
