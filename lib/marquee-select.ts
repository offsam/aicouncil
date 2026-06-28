import type { Camera } from "three";
import { Vector3 } from "three";
import type { SnappedRect } from "./floor-grid";

export interface ScreenRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const PROJECT = new Vector3();

export function normalizeScreenRect(rect: ScreenRect): ScreenRect {
  return {
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
  };
}

export function worldXZInScreenRect(
  x: number,
  z: number,
  camera: Camera,
  width: number,
  height: number,
  rect: ScreenRect,
): boolean {
  PROJECT.set(x, 0, z).project(camera);
  if (PROJECT.z > 1) return false;

  const sx = (PROJECT.x * 0.5 + 0.5) * width;
  const sy = (-PROJECT.y * 0.5 + 0.5) * height;
  const box = normalizeScreenRect(rect);

  return sx >= box.x1 && sx <= box.x2 && sy >= box.y1 && sy <= box.y2;
}

export function objectsInMarquee(
  objects: Array<{ id: string; position_x: number; position_z: number }>,
  camera: Camera,
  width: number,
  height: number,
  rect: ScreenRect,
): string[] {
  const box = normalizeScreenRect(rect);
  if (box.x2 - box.x1 < 4 && box.y2 - box.y1 < 4) return [];

  return objects
    .filter((o) => worldXZInScreenRect(o.position_x, o.position_z, camera, width, height, box))
    .map((o) => o.id);
}

export function objectsInWorldRect(
  objects: Array<{ id: string; position_x: number; position_z: number }>,
  rect: SnappedRect,
): string[] {
  return objects
    .filter(
      (o) =>
        o.position_x >= rect.minX &&
        o.position_x <= rect.maxX &&
        o.position_z >= rect.minZ &&
        o.position_z <= rect.maxZ,
    )
    .map((o) => o.id);
}
