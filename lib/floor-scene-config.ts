/** Shared low-poly scene tuning for /floor 3D editor */

/** Orbit: от близкого редактирования до обзора всего участка с ландшафтом */
export const FLOOR_CAMERA = {
  minDistance: 6,
  maxDistance: 580,
  fov: 48,
  /** Стартовая позиция — чуть дальше, сразу виден контекст */
  defaultPosition: [42, 34, 42] as const,
  topDownHeight: 320,
} as const;

export const LP = {
  /** Capsule: radius, length, capSegments, radialSegments */
  capsule: [0.35, 0.7, 6, 10] as const,
  sphere: [0.08, 10, 10] as const,
  ring: 12,
  rounded: { radius: 0.06, smoothness: 3 },
} as const;

export const matte = {
  roughness: 0.72,
  metalness: 0.04,
  flatShading: true,
} as const;

export const matteSoft = {
  roughness: 0.78,
  metalness: 0.02,
  flatShading: true,
} as const;

/** Объекты сцены — чуть насыщеннее */
export const objectPalette = {
  wall: "#ebe4d8",
  wallEmissive: "#000000",
  door: "#f0c98a",
  doorEmissive: "#000000",
  cabinet: "#d4843a",
  cabinetTrim: "#b86e28",
  cabinetEmissive: "#000000",
  board: "#faf5ec",
  boardEmissive: "#000000",
} as const;
