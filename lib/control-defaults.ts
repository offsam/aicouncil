/** Default geometry when 2D UI creates entities without a map editor. */
export const DEFAULT_BUILDING = {
  position_x: 0,
  position_z: 0,
  size_w: 8,
  size_d: 6,
} as const;

/** Default chamber footprint for workspace canvas (building-local units). ~3× prior 2×2 size. */
export const DEFAULT_CHAMBER = {
  x: 0,
  z: 0,
  width: 6,
  depth: 6,
} as const;
