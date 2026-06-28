import { FLOOR_GRID, snapFloorCoord } from "./floor-grid";
import { OFFICE_ROOM, WORK_FLOOR } from "./office-bounds";

export function cellKey(x: number, z: number): string {
  return `${snapFloorCoord(x)},${snapFloorCoord(z)}`;
}

export function parseCellKey(key: string): { x: number; z: number } | null {
  const [xs, zs] = key.split(",");
  const x = Number(xs);
  const z = Number(zs);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

export function cellsInRect(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): string[] {
  const keys: string[] = [];
  for (let x = minX; x < maxX; x += FLOOR_GRID) {
    for (let z = minZ; z < maxZ; z += FLOOR_GRID) {
      keys.push(cellKey(x + FLOOR_GRID / 2, z + FLOOR_GRID / 2));
    }
  }
  return keys;
}

export function roomCellBounds(room: {
  position_x: number;
  position_z: number;
  size_w: number;
  size_d: number;
}) {
  const minX = room.position_x - room.size_w / 2;
  const maxX = room.position_x + room.size_w / 2;
  const minZ = room.position_z - room.size_d / 2;
  const maxZ = room.position_z + room.size_d / 2;
  return { minX, maxX, minZ, maxZ };
}

export function findRoomAtCell(
  rooms: Array<{
    id: string;
    object_type: string;
    position_x: number;
    position_z: number;
    size_w: number | null;
    size_d: number | null;
  }>,
  x: number,
  z: number,
) {
  const cx = snapFloorCoord(x);
  const cz = snapFloorCoord(z);
  for (const room of rooms) {
    if (room.object_type !== "room" || !room.size_w || !room.size_d) continue;
    const { minX, maxX, minZ, maxZ } = roomCellBounds({
      position_x: room.position_x,
      position_z: room.position_z,
      size_w: room.size_w,
      size_d: room.size_d,
    });
    if (cx >= minX && cx < maxX && cz >= minZ && cz < maxZ) return room;
  }
  return null;
}

export function innerFloorBounds() {
  const w = OFFICE_ROOM.width;
  const d = OFFICE_ROOM.depth;
  const z = OFFICE_ROOM.centerZ;
  return { minX: -w / 2, maxX: w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

export function outerFloorBounds() {
  const w = WORK_FLOOR.width;
  const d = WORK_FLOOR.depth;
  const z = WORK_FLOOR.centerZ;
  return { minX: -w / 2, maxX: w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

export function countVisibleRoomCells(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  erased: Set<string>,
): number {
  return cellsInRect(minX, maxX, minZ, maxZ).filter((k) => !erased.has(k)).length;
}
