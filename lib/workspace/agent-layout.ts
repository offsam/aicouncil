/** Default stagger for agents inside a chamber (chamber-local units, center-relative). */
export function defaultAgentLocalPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 0, y: 0 };
  const angle = (index * Math.PI * 2) / 6;
  const radius = 0.65 + Math.floor(index / 6) * 0.35;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export const AGENT_NODE_DIAMETER_PX = 80;
/** Smallest resize diameter — below ~36px labels hide via container queries. */
export const AGENT_NODE_MIN_PX = 12;
export const AGENT_NODE_MAX_PX = 160;

export function agentDiameterPx(layoutSize: number | null | undefined): number {
  const raw = layoutSize ?? AGENT_NODE_DIAMETER_PX;
  return Math.min(AGENT_NODE_MAX_PX, Math.max(AGENT_NODE_MIN_PX, raw));
}

/** Clamp a live resize / drag size to the allowed agent diameter range. */
export function clampAgentSizePx(sizePx: number): number {
  return agentDiameterPx(sizePx);
}
