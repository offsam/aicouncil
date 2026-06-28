import type { PastelId } from "./floor-pastel-palette";

export interface OfficePaintSettings {
  floorInner: PastelId;
  floorOuter: PastelId;
  edge: PastelId;
  /** Скрыт базовый пол AI Council (центр) */
  hiddenInnerFloor?: boolean;
  /** Скрыта базовая рабочая площадка */
  hiddenOuterFloor?: boolean;
  /** Снесённые ячейки сетки на базовых полах */
  erodedCells?: {
    inner?: string[];
    outer?: string[];
  };
}

export const DEFAULT_OFFICE_PAINT: OfficePaintSettings = {
  floorInner: "sky",
  floorOuter: "stone",
  edge: "sage",
};

const STORAGE_PREFIX = "floor-paint-";

export function loadLocalPaint(officeId: string): OfficePaintSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${officeId}`);
    if (!raw) return null;
    return JSON.parse(raw) as OfficePaintSettings;
  } catch {
    return null;
  }
}

export function saveLocalPaint(officeId: string, paint: OfficePaintSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_PREFIX}${officeId}`, JSON.stringify(paint));
}

export type PaintTarget =
  | { kind: "wall"; objectId: string }
  | { kind: "room"; objectId: string };
