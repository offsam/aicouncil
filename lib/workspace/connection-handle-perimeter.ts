import { Position } from "@xyflow/react";

export type HandleNodeShape = "rect" | "circle";

export type PerimeterPoint = {
  leftPercent: number;
  topPercent: number;
  position: Position;
  perimeterPercent: number;
};

const SIDE_TO_POSITION: Record<"top" | "right" | "bottom" | "left", Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/** Arc-length percent (0–100) clockwise from top-left along a rectangle perimeter. */
export function perimeterPercentToPoint(
  percent: number,
  width: number,
  height: number,
  shape: HandleNodeShape = "rect",
): PerimeterPoint {
  if (shape === "circle") {
    const angle = (percent / 100) * Math.PI * 2 - Math.PI / 2;
    const leftPercent = 50 + 50 * Math.cos(angle);
    const topPercent = 50 + 50 * Math.sin(angle);
    const position =
      Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle))
        ? Math.cos(angle) >= 0
          ? Position.Right
          : Position.Left
        : Math.sin(angle) >= 0
          ? Position.Bottom
          : Position.Top;
    return { leftPercent, topPercent, position, perimeterPercent: percent };
  }

  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const total = 2 * (w + h);
  let d = (((percent % 100) + 100) % 100) / 100 * total;

  if (d <= w) {
    return {
      leftPercent: (d / w) * 100,
      topPercent: 0,
      position: SIDE_TO_POSITION.top,
      perimeterPercent: percent,
    };
  }
  d -= w;
  if (d <= h) {
    return {
      leftPercent: 100,
      topPercent: (d / h) * 100,
      position: SIDE_TO_POSITION.right,
      perimeterPercent: percent,
    };
  }
  d -= h;
  if (d <= w) {
    return {
      leftPercent: ((w - d) / w) * 100,
      topPercent: 100,
      position: SIDE_TO_POSITION.bottom,
      perimeterPercent: percent,
    };
  }
  d -= w;
  return {
    leftPercent: 0,
    topPercent: ((h - d) / h) * 100,
    position: SIDE_TO_POSITION.left,
    perimeterPercent: percent,
  };
}

/** Closest perimeter percent for a point in node-local pixels. */
export function pointToPerimeterPercent(
  x: number,
  y: number,
  width: number,
  height: number,
  shape: HandleNodeShape = "rect",
): number {
  if (shape === "circle") {
    const cx = width / 2;
    const cy = height / 2;
    const angle = Math.atan2(y - cy, x - cx);
    const normalized = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    return (normalized / (Math.PI * 2)) * 100;
  }

  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const total = 2 * (w + h);

  const candidates: Array<{ dist: number; percent: number }> = [];

  const topX = Math.max(0, Math.min(w, x));
  candidates.push({
    dist: Math.hypot(x - topX, y),
    percent: (topX / total) * 100,
  });

  const rightY = Math.max(0, Math.min(h, y));
  candidates.push({
    dist: Math.hypot(x - w, y - rightY),
    percent: ((w + rightY) / total) * 100,
  });

  const bottomX = Math.max(0, Math.min(w, w - x));
  candidates.push({
    dist: Math.hypot(x - (w - bottomX), y - h),
    percent: ((w + h + bottomX) / total) * 100,
  });

  const leftY = Math.max(0, Math.min(h, h - y));
  candidates.push({
    dist: Math.hypot(x, y - (h - leftY)),
    percent: ((w + h + w + leftY) / total) * 100,
  });

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0]?.percent ?? 0;
}

/** Convert legacy side + offset to perimeter percent for migration. */
export function legacySlotToPerimeterPercent(
  position: Position,
  offsetPercent: number,
  width = 120,
  height = 80,
): number {
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const total = 2 * (w + h);
  const offset = (offsetPercent / 100) * (position === Position.Top || position === Position.Bottom ? w : h);

  switch (position) {
    case Position.Top:
      return (offset / total) * 100;
    case Position.Right:
      return ((w + offset) / total) * 100;
    case Position.Bottom:
      return ((w + h + (w - offset)) / total) * 100;
    case Position.Left:
      return ((w + h + w + (h - offset)) / total) * 100;
    default:
      return 0;
  }
}

export type PerimeterDirection = {
  /** Unit vector along perimeter (clockwise), node-local pixels. */
  tangent: { x: number; y: number };
  /** Unit vector pointing outward from the node center. */
  outward: { x: number; y: number };
};

/** Tangent and outward normal at a perimeter percent (node-local, y-down). */
export function perimeterDirectionAt(
  percent: number,
  width: number,
  height: number,
  shape: HandleNodeShape = "rect",
): PerimeterDirection {
  if (shape === "circle") {
    const angle = (percent / 100) * Math.PI * 2 - Math.PI / 2;
    const outward = { x: Math.cos(angle), y: Math.sin(angle) };
    return { tangent: { x: -outward.y, y: outward.x }, outward };
  }

  const point = perimeterPercentToPoint(percent, width, height, "rect");
  switch (point.position) {
    case Position.Top:
      return { tangent: { x: 1, y: 0 }, outward: { x: 0, y: -1 } };
    case Position.Right:
      return { tangent: { x: 0, y: 1 }, outward: { x: 1, y: 0 } };
    case Position.Bottom:
      return { tangent: { x: -1, y: 0 }, outward: { x: 0, y: 1 } };
    case Position.Left:
    default:
      return { tangent: { x: 0, y: -1 }, outward: { x: -1, y: 0 } };
  }
}

/**
 * Classify an initial drag from a handle: along the perimeter vs outward to draw a cable.
 * Uses node-local drag delta (same space as width/height).
 */
export function classifyHandleDragDirection(
  dragLocalX: number,
  dragLocalY: number,
  perimeterPercent: number,
  width: number,
  height: number,
  shape: HandleNodeShape = "rect",
): "along" | "outward" {
  const { tangent, outward } = perimeterDirectionAt(perimeterPercent, width, height, shape);
  const dotT = dragLocalX * tangent.x + dragLocalY * tangent.y;
  const dotO = dragLocalX * outward.x + dragLocalY * outward.y;
  const dragLen = Math.hypot(dragLocalX, dragLocalY);
  if (dotO > 0 && dotO >= Math.abs(dotT) * 0.15) return "outward";
  if (dotO > 0 && dragLen >= 6) return "outward";
  if (dragLen >= 10 && dotO >= -0.15 * dragLen) return "outward";
  return "along";
}

export function normalizeSlotPerimeterPercent(
  slot: { perimeterPercent?: number; position?: Position; offsetPercent?: number },
  width = 120,
  height = 80,
): number {
  if (typeof slot.perimeterPercent === "number" && Number.isFinite(slot.perimeterPercent)) {
    return slot.perimeterPercent;
  }
  if (slot.position != null && typeof slot.offsetPercent === "number") {
    return legacySlotToPerimeterPercent(slot.position, slot.offsetPercent, width, height);
  }
  return 0;
}
