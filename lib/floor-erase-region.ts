import {
  cellKey,
  cellsInRect,
  findRoomAtCell,
  innerFloorBounds,
  outerFloorBounds,
  parseCellKey,
} from "./floor-cell-key";
import type { SnappedRect } from "./floor-grid";

export type FloorEraseZone = "inner" | "outer" | "room";

export interface ClassifiedCell {
  key: string;
  zone: FloorEraseZone;
  roomId?: string;
}

export function classifyFloorCell(
  x: number,
  z: number,
  rooms: Array<{
    id: string;
    object_type: string;
    position_x: number;
    position_z: number;
    size_w: number | null;
    size_d: number | null;
  }>,
): ClassifiedCell | null {
  const key = cellKey(x, z);
  const room = findRoomAtCell(rooms, x, z);
  if (room) return { key, zone: "room", roomId: room.id };

  const parsed = parseCellKey(key);
  if (!parsed) return null;
  const { x: cx, z: cz } = parsed;

  const inner = innerFloorBounds();
  if (cx >= inner.minX && cx < inner.maxX && cz >= inner.minZ && cz < inner.maxZ) {
    return { key, zone: "inner" };
  }

  const outer = outerFloorBounds();
  if (cx >= outer.minX && cx < outer.maxX && cz >= outer.minZ && cz < outer.maxZ) {
    return { key, zone: "outer" };
  }

  return null;
}

export function classifiedCellsInRect(
  rect: SnappedRect,
  rooms: Array<{
    id: string;
    object_type: string;
    position_x: number;
    position_z: number;
    size_w: number | null;
    size_d: number | null;
  }>,
): ClassifiedCell[] {
  const keys = cellsInRect(rect.minX, rect.maxX, rect.minZ, rect.maxZ);
  const out: ClassifiedCell[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) continue;
    const parsed = parseCellKey(key);
    if (!parsed) continue;
    const classified = classifyFloorCell(parsed.x, parsed.z, rooms);
    if (!classified) continue;
    seen.add(classified.key);
    out.push(classified);
  }

  return out;
}
