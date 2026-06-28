import type { OfficePaintSettings } from "./floor-paint-storage";

export interface FloorCutoutStore {
  baseInner: string[];
  baseOuter: string[];
  rooms: Record<string, string[]>;
}

export const EMPTY_CUTOUTS: FloorCutoutStore = {
  baseInner: [],
  baseOuter: [],
  rooms: {},
};

const STORAGE_PREFIX = "floor-cutouts-";

export function cutoutsFromPaint(paint: OfficePaintSettings): FloorCutoutStore {
  const eroded = paint.erodedCells;
  return {
    baseInner: eroded?.inner ? [...eroded.inner] : [],
    baseOuter: eroded?.outer ? [...eroded.outer] : [],
    rooms: {},
  };
}

export function cutoutsToPaintPatch(
  cutouts: FloorCutoutStore,
): Pick<OfficePaintSettings, "erodedCells"> {
  return {
    erodedCells: {
      inner: cutouts.baseInner.length ? cutouts.baseInner : undefined,
      outer: cutouts.baseOuter.length ? cutouts.baseOuter : undefined,
    },
  };
}

export function loadLocalCutouts(officeId: string): FloorCutoutStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${officeId}`);
    if (!raw) return null;
    return JSON.parse(raw) as FloorCutoutStore;
  } catch {
    return null;
  }
}

export function saveLocalCutouts(officeId: string, cutouts: FloorCutoutStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_PREFIX}${officeId}`, JSON.stringify(cutouts));
}

export function roomCutoutSet(cutouts: FloorCutoutStore, roomId: string): Set<string> {
  return new Set(cutouts.rooms[roomId] ?? []);
}

export function withRoomCutout(
  cutouts: FloorCutoutStore,
  roomId: string,
  key: string,
): FloorCutoutStore {
  const prev = cutouts.rooms[roomId] ?? [];
  if (prev.includes(key)) return cutouts;
  return {
    ...cutouts,
    rooms: { ...cutouts.rooms, [roomId]: [...prev, key] },
  };
}

export function withBaseCutout(
  cutouts: FloorCutoutStore,
  zone: "inner" | "outer",
  key: string,
): FloorCutoutStore {
  const field = zone === "inner" ? "baseInner" : "baseOuter";
  const prev = cutouts[field];
  if (prev.includes(key)) return cutouts;
  return { ...cutouts, [field]: [...prev, key] };
}

export function parseRoomCutouts(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((v) => typeof v === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}
