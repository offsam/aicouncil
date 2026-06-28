/** Per-entity accent palette (buildings, chambers, agents, cables). */
export const BUILDING_ACCENT_PALETTE = [
  { id: "red", border: "#ef4444", glow: "rgba(239, 68, 68, 0.42)", bg: "rgba(69, 10, 10, 0.88)" },
  { id: "coral", border: "#ff6b6b", glow: "rgba(255, 107, 107, 0.42)", bg: "rgba(69, 10, 10, 0.88)" },
  { id: "ruby", border: "#e11d48", glow: "rgba(225, 29, 72, 0.42)", bg: "rgba(76, 5, 25, 0.9)" },
  { id: "wine", border: "#9f1239", glow: "rgba(159, 18, 57, 0.42)", bg: "rgba(76, 5, 25, 0.92)" },
  { id: "orange", border: "#f97316", glow: "rgba(249, 115, 22, 0.42)", bg: "rgba(67, 20, 7, 0.88)" },
  { id: "amber", border: "#fbbf24", glow: "rgba(251, 191, 36, 0.42)", bg: "rgba(69, 26, 3, 0.88)" },
  { id: "gold", border: "#eab308", glow: "rgba(234, 179, 8, 0.42)", bg: "rgba(54, 33, 3, 0.88)" },
  { id: "lime", border: "#84cc16", glow: "rgba(132, 204, 22, 0.42)", bg: "rgba(26, 46, 5, 0.88)" },
  { id: "olive", border: "#65a30d", glow: "rgba(101, 163, 13, 0.42)", bg: "rgba(26, 46, 5, 0.9)" },
  { id: "jade", border: "#10b981", glow: "rgba(16, 185, 129, 0.42)", bg: "rgba(6, 78, 59, 0.9)" },
  { id: "emerald", border: "#34d399", glow: "rgba(52, 211, 153, 0.42)", bg: "rgba(6, 78, 59, 0.88)" },
  { id: "teal", border: "#14b8a6", glow: "rgba(20, 184, 166, 0.42)", bg: "rgba(4, 47, 46, 0.9)" },
  { id: "cyan", border: "#06b6d4", glow: "rgba(6, 182, 212, 0.42)", bg: "rgba(8, 47, 73, 0.88)" },
  { id: "sky", border: "#0ea5e9", glow: "rgba(14, 165, 233, 0.42)", bg: "rgba(12, 74, 110, 0.88)" },
  { id: "blue", border: "#3b82f6", glow: "rgba(59, 130, 246, 0.42)", bg: "rgba(23, 37, 84, 0.9)" },
  { id: "indigo", border: "#6366f1", glow: "rgba(99, 102, 241, 0.42)", bg: "rgba(30, 27, 75, 0.9)" },
  { id: "violet", border: "#8b5cf6", glow: "rgba(139, 92, 246, 0.42)", bg: "rgba(46, 16, 101, 0.88)" },
  { id: "fuchsia", border: "#d946ef", glow: "rgba(217, 70, 239, 0.42)", bg: "rgba(59, 7, 54, 0.88)" },
  { id: "pink", border: "#ec4899", glow: "rgba(236, 72, 153, 0.42)", bg: "rgba(80, 7, 36, 0.88)" },
  { id: "rose", border: "#fb7185", glow: "rgba(251, 113, 133, 0.42)", bg: "rgba(76, 5, 25, 0.88)" },
  { id: "brown", border: "#b45309", glow: "rgba(180, 83, 9, 0.42)", bg: "rgba(69, 26, 3, 0.92)" },
  { id: "slate", border: "#94a3b8", glow: "rgba(148, 163, 184, 0.38)", bg: "rgba(30, 41, 59, 0.92)" },
  { id: "pearl", border: "#e2e8f0", glow: "rgba(226, 232, 240, 0.35)", bg: "rgba(30, 41, 59, 0.9)" },
  { id: "mint", border: "#6ee7b7", glow: "rgba(110, 231, 183, 0.4)", bg: "rgba(6, 78, 59, 0.85)" },
] as const;

export type BuildingAccentId = (typeof BUILDING_ACCENT_PALETTE)[number]["id"];

/** Legacy ids from older palettes → closest current swatch. */
const PALETTE_ID_ALIASES: Record<string, BuildingAccentId> = {
  neon: "lime",
  electric: "cyan",
  aqua: "teal",
  arctic: "sky",
  ice: "sky",
  ultraviolet: "violet",
  periwinkle: "indigo",
  orchid: "fuchsia",
  chartreuse: "lime",
  copper: "orange",
  bronze: "brown",
  honey: "amber",
  magenta: "fuchsia",
  plum: "fuchsia",
  crimson: "ruby",
  scarlet: "red",
  maroon: "wine",
  forest: "jade",
  turquoise: "teal",
  cobalt: "blue",
  sapphire: "blue",
  steel: "slate",
  lemon: "gold",
  sunset: "coral",
  sakura: "pink",
  lavender: "violet",
  mistral: "slate",
};

export function resolvePaletteId(id: string): BuildingAccentId | null {
  const normalized = id.trim().toLowerCase();
  const resolved = (PALETTE_ID_ALIASES[normalized] ?? normalized) as BuildingAccentId;
  return BUILDING_ACCENT_PALETTE.some((entry) => entry.id === resolved) ? resolved : null;
}

export function accentIndexFromPaletteId(id: string): number | null {
  const resolved = resolvePaletteId(id);
  if (!resolved) return null;
  const idx = BUILDING_ACCENT_PALETTE.findIndex((p) => p.id === resolved);
  return idx >= 0 ? idx : null;
}

export function paletteIdFromAccentIndex(index: number): BuildingAccentId {
  return BUILDING_ACCENT_PALETTE[index]?.id ?? BUILDING_ACCENT_PALETTE[0].id;
}

const CITY_HALL_ACCENT_INDEX =
  BUILDING_ACCENT_PALETTE.findIndex((entry) => entry.id === "amber");

export function resolveBuildingAccentIndex(
  color: string | null | undefined,
  buildingId: string,
  isCityHall: boolean,
): number {
  if (isCityHall) return CITY_HALL_ACCENT_INDEX >= 0 ? CITY_HALL_ACCENT_INDEX : 0;
  if (color) {
    const fromColor = accentIndexFromPaletteId(color);
    if (fromColor != null) return fromColor;
  }
  return buildingAccentIndex(buildingId, false);
}

export function resolveChamberAccentIndex(
  chamberColor: string | null | undefined,
  buildingColor: string | null | undefined,
  buildingId: string,
  isCityHall: boolean,
): number {
  if (chamberColor) {
    const fromChamber = accentIndexFromPaletteId(chamberColor);
    if (fromChamber != null) return fromChamber;
  }
  return resolveBuildingAccentIndex(buildingColor, buildingId, isCityHall);
}

export function buildingAccentIndex(buildingId: string, isCityHall: boolean): number {
  if (isCityHall) return CITY_HALL_ACCENT_INDEX >= 0 ? CITY_HALL_ACCENT_INDEX : 0;
  let hash = 0;
  for (let i = 0; i < buildingId.length; i++) {
    hash = (hash * 31 + buildingId.charCodeAt(i)) >>> 0;
  }
  return hash % BUILDING_ACCENT_PALETTE.length;
}

export function resolveAgentAccentIndex(
  color: string | null | undefined,
  agentId: string,
): number {
  if (color) {
    const fromColor = accentIndexFromPaletteId(color);
    if (fromColor != null) return fromColor;
  }
  return buildingAccentIndex(agentId, false);
}

export function buildingAccentCssVars(index: number): Record<string, string> {
  const accent = BUILDING_ACCENT_PALETTE[index] ?? BUILDING_ACCENT_PALETTE[0];
  return {
    "--ws-building-border": accent.border,
    "--ws-building-glow": accent.glow,
    "--ws-building-bg": accent.bg,
    "--ws-perimeter-shadow": [
      `0 2px 8px color-mix(in srgb, ${accent.border} 18%, rgba(0, 0, 0, 0.05))`,
      `0 10px 26px color-mix(in srgb, ${accent.glow} 28%, rgba(0, 0, 0, 0.04))`,
    ].join(", "),
    "--ws-perimeter-shadow-hover": [
      `0 3px 10px color-mix(in srgb, ${accent.border} 20%, rgba(0, 0, 0, 0.06))`,
      `0 10px 28px color-mix(in srgb, ${accent.glow} 30%, rgba(0, 0, 0, 0.05))`,
    ].join(", "),
    "--ws-perimeter-shadow-selected": [
      `0 3px 12px color-mix(in srgb, ${accent.border} 22%, rgba(0, 0, 0, 0.07))`,
      `0 11px 30px color-mix(in srgb, ${accent.glow} 32%, rgba(0, 0, 0, 0.06))`,
    ].join(", "),
  };
}

const DEFAULT_CONNECTION_STROKE = "var(--border-soft)";

export function connectionStrokeFromColorId(colorId: string | null | undefined): string {
  void colorId;
  return DEFAULT_CONNECTION_STROKE;
}

export function connectionEdgeStyle(colorId: string | null | undefined): {
  stroke: string;
  strokeWidth: number;
} {
  return {
    stroke: connectionStrokeFromColorId(colorId),
    strokeWidth: 2,
  };
}
