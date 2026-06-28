export const AGENT_WORK_MODEL_URL =
  "/agents/low_poly_man_working_at_a_table_with_a_laptop.glb";

/** Масштаб и поворот модели относительно ячейки стола */
export const AGENT_MODEL_TRANSFORM = {
  /** ~в 4 раза меньше прежнего 0.55 */
  scale: 0.14,
  rotationY: Math.PI,
  /** Верх видимого пола офиса (неоновая кромка на y ≈ 0.02) */
  floorY: 0.02,
} as const;

/** UI-якоря относительно масштабированной модели */
export const AGENT_UI = {
  /** Лампочка над головой — цвет агента */
  lampY: 0.34,
  lampRadius: 0.035,
  labelY: 0.42,
  ring: { inner: 0.2, outer: 0.24 } as const,
  hoverBounce: 0.008,
} as const;
