import { OFFICE_ROOM } from "./office-bounds";
import type { OfficeObjectRow } from "./office-types";

function wallId(i: number) {
  return `default-wall-${i}`;
}

/** Периметр стандартного офиса AI Council — редактируемые сегменты стен + дверь */
export function buildDefaultOfficeWalls(officeId: string): OfficeObjectRow[] {
  const { width, depth, centerZ } = OFFICE_ROOM;
  const now = new Date().toISOString();
  const objects: OfficeObjectRow[] = [];
  let i = 0;
  const step = 2;

  const addWall = (x: number, z: number, rotationY: number) => {
    objects.push({
      id: wallId(i++),
      office_id: officeId,
      object_type: "wall",
      position_x: x,
      position_z: z,
      rotation_y: rotationY,
      agent_id: null,
      color: null,
      size_w: 2,
      size_d: null,
      label: null,
      created_at: now,
    });
  };

  const zSouth = centerZ - depth / 2 + 0.5;
  const zNorth = centerZ + depth / 2 - 0.5;
  const xWest = -width / 2 + 0.5;
  const xEast = width / 2 - 0.5;

  for (let x = -width / 2 + 1; x <= width / 2 - 1; x += step) {
    if (Math.abs(x) > 1.2) addWall(x, zSouth, 0);
    addWall(x, zNorth, 0);
  }

  objects.push({
    id: wallId(i++),
    office_id: officeId,
    object_type: "door",
    position_x: 0,
    position_z: zSouth,
    rotation_y: 0,
    agent_id: null,
    color: null,
    size_w: null,
    size_d: null,
    label: null,
    created_at: now,
  });

  for (let z = centerZ - depth / 2 + 1; z <= centerZ + depth / 2 - 1; z += step) {
    addWall(xWest, z, Math.PI / 2);
    addWall(xEast, z, Math.PI / 2);
  }

  return objects;
}
