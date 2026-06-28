"use client";

import { useEffect, useState } from "react";
import {
  cableActiveColor,
  isPastelId,
  resolvePastel,
  sceneAccent,
  type PastelId,
} from "./floor-pastel-palette";
import type { OfficePaintSettings } from "./floor-paint-storage";
import { DEFAULT_OFFICE_PAINT } from "./floor-paint-storage";

export function getSceneColors(isDark: boolean, paint: OfficePaintSettings = DEFAULT_OFFICE_PAINT) {
  const accent = sceneAccent(isDark);
  if (isDark) {
    return {
      background: "#141210",
      floorInner: resolvePastel(paint.floorInner, true),
      floorOuter: resolvePastel(paint.floorOuter, true),
      wall: resolvePastel(paint.edge, true),
      desk: resolvePastel("stone", true),
      label: "#e7e5e4",
      outline: accent,
      textOutline: "#141210",
      agentLabel: "#f5f5f4",
      cableActive: cableActiveColor(true),
      selection: accent,
    };
  }

  return {
    background: "#f5f0e8",
    floorInner: resolvePastel(paint.floorInner, false),
    floorOuter: resolvePastel(paint.floorOuter, false),
    wall: resolvePastel(paint.edge, false),
    desk: resolvePastel("stone", false),
    label: "#44403c",
    outline: accent,
    textOutline: "#faf8f5",
    agentLabel: "#292524",
    cableActive: cableActiveColor(false),
    selection: accent,
  };
}

export type SceneColors = ReturnType<typeof getSceneColors>;

export function paintFromOfficeRow(
  row: { scene_paint?: Record<string, string | undefined> | null } | null,
): OfficePaintSettings {
  const p = row?.scene_paint;
  if (!p) return DEFAULT_OFFICE_PAINT;
  const pick = (v: string | undefined, fallback: PastelId) =>
    isPastelId(v ?? "") ? v as PastelId : fallback;
  const pickBool = (v: unknown) => v === true || v === "true" || v === "1";
  return {
    floorInner: pick(p.floorInner, DEFAULT_OFFICE_PAINT.floorInner),
    floorOuter: pick(p.floorOuter, DEFAULT_OFFICE_PAINT.floorOuter),
    edge: pick(p.edge, DEFAULT_OFFICE_PAINT.edge),
    hiddenInnerFloor: pickBool(p.hiddenInnerFloor),
    hiddenOuterFloor: pickBool(p.hiddenOuterFloor),
  };
}

export function usePrefersDark(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);

    const onChange = (event: MediaQueryListEvent) => {
      setIsDark(event.matches);
    };

    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDark;
}
