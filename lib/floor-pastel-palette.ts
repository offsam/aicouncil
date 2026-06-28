export const PASTEL_PALETTE = [
  { id: "cream", label: "Крем", light: "#faf0e4", dark: "#4a4038" },
  { id: "sage", label: "Шалфей", light: "#c8e6bc", dark: "#3d5038" },
  { id: "sky", label: "Небо", light: "#c5dff5", dark: "#344858" },
  { id: "peach", label: "Персик", light: "#f8d4c4", dark: "#4a3835" },
  { id: "stone", label: "Камень", light: "#ebe4d8", dark: "#454038" },
  { id: "lavender", label: "Лаванда", light: "#e8dff5", dark: "#443a52" },
  { id: "rose", label: "Роза", light: "#f5d0d8", dark: "#4a3038" },
  { id: "mint", label: "Мята", light: "#d4f0e4", dark: "#354840" },
  { id: "sand", label: "Песок", light: "#f0e6d2", dark: "#484038" },
  { id: "lilac", label: "Сирень", light: "#ddd0f0", dark: "#403848" },
  { id: "mist", label: "Туман", light: "#dce8ee", dark: "#384248" },
  { id: "blush", label: "Румянец", light: "#f8e0e8", dark: "#483840" },
  { id: "wheat", label: "Пшеница", light: "#f5ecd0", dark: "#484438" },
  { id: "ocean", label: "Океан", light: "#b8d8e8", dark: "#304858" },
  { id: "moss", label: "Мох", light: "#d0e0c8", dark: "#384838" },
  { id: "coral", label: "Коралл", light: "#f8d8d0", dark: "#4a3835" },
  { id: "dusk", label: "Сумерки", light: "#d8d0e8", dark: "#3c3848" },
  { id: "honey", label: "Мёд", light: "#f5e8c8", dark: "#484030" },
] as const;

export type PastelId = (typeof PASTEL_PALETTE)[number]["id"];

export function resolvePastel(id: PastelId, isDark: boolean): string {
  const swatch = PASTEL_PALETTE.find((p) => p.id === id);
  if (!swatch) return isDark ? PASTEL_PALETTE[4].dark : PASTEL_PALETTE[4].light;
  return isDark ? swatch.dark : swatch.light;
}

export function isPastelId(value: string): value is PastelId {
  return PASTEL_PALETTE.some((p) => p.id === value);
}

export function hexFromPastelOrRaw(value: string, isDark: boolean): string {
  if (isPastelId(value)) return resolvePastel(value, isDark);
  return value;
}

/** Акцент для кромок, кабелей, выделения */
export const SCENE_ACCENT = {
  light: "#5c9699",
  dark: "#7ec8d4",
  cableActive: { light: "#3da8b8", dark: "#6ec4d4" },
} as const;

export function sceneAccent(isDark: boolean) {
  return isDark ? SCENE_ACCENT.dark : SCENE_ACCENT.light;
}

export function cableActiveColor(isDark: boolean) {
  return isDark ? SCENE_ACCENT.cableActive.dark : SCENE_ACCENT.cableActive.light;
}
