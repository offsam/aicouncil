import type { Node } from "@xyflow/react";
import { Position } from "@xyflow/react";
import type { ConnectionHandleSlot } from "./connection-handle-slots";
import { nodeSizePx } from "./coords";
import {
  perimeterPercentToPoint,
  type HandleNodeShape,
} from "./connection-handle-perimeter";

export type HandleSide = "left" | "right" | "top" | "bottom";

export type HandleFlowAnchor = {
  x: number;
  y: number;
  side: HandleSide;
  /** Unit vector pointing outward from the node (cable exit direction). */
  outwardX: number;
  outwardY: number;
};

const POSITION_TO_SIDE: Record<Position, HandleSide> = {
  [Position.Left]: "left",
  [Position.Right]: "right",
  [Position.Top]: "top",
  [Position.Bottom]: "bottom",
};

const SIDE_OUTWARD: Record<HandleSide, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

export function nodeShapeForType(nodeType: string | undefined): HandleNodeShape {
  return nodeType === "agent" ? "circle" : "rect";
}

/** Stable key that changes when a node or ancestor moves, resizes, or has handles dragged (for edge anchor invalidation). */
export function nodeLayoutKey(
  node: Node | undefined,
  getNode: (id: string) => Node | undefined,
): string {
  if (!node) return "";
  const { width, height } = nodeLocalSize(node);
  let key = `${node.position.x},${node.position.y},${width},${height}`;

  const slots = (node.data as { connectionHandles?: ConnectionHandleSlot[] })?.connectionHandles;
  if (slots) {
    key += `|H:${slots.map((s) => `${s.id}:${s.perimeterPercent}`).join(",")}`;
  }

  let parentId = node.parentId;
  while (parentId) {
    const parent = getNode(parentId);
    if (!parent) break;
    const ps = nodeLocalSize(parent);
    key += `|${parent.position.x},${parent.position.y},${ps.width},${ps.height}`;

    const pSlots = (parent.data as { connectionHandles?: ConnectionHandleSlot[] })?.connectionHandles;
    if (pSlots) {
      key += `|PH:${pSlots.map((s) => `${s.id}:${s.perimeterPercent}`).join(",")}`;
    }

    parentId = parent.parentId;
  }
  return key;
}

export function nodeAbsolutePosition(
  node: Node,
  getNode: (id: string) => Node | undefined,
): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  while (parentId) {
    const parent = getNode(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

export function nodeLocalSize(node: Node): { width: number; height: number } {
  const styleW =
    typeof node.style?.width === "number"
      ? node.style.width
      : Number.parseFloat(String(node.style?.width ?? ""));
  const styleH =
    typeof node.style?.height === "number"
      ? node.style.height
      : Number.parseFloat(String(node.style?.height ?? ""));
  const fallbackW = Number.isFinite(styleW) && styleW > 0 ? styleW : 120;
  const fallbackH = Number.isFinite(styleH) && styleH > 0 ? styleH : 80;
  return nodeSizePx(node, fallbackW, fallbackH);
}

/** Flow-space center of a perimeter handle jack on a node. */
export function handleFlowPoint(
  node: Node,
  handleId: string | null | undefined,
  getNode: (id: string) => Node | undefined,
  shape?: HandleNodeShape,
): { x: number; y: number } | null {
  if (!handleId) return null;
  const slots = (node.data as { connectionHandles?: ConnectionHandleSlot[] }).connectionHandles;
  const slot = slots?.find((s) => s.id === handleId);
  if (!slot) return null;

  const { width, height } = nodeLocalSize(node);
  const nodeShape = shape ?? nodeShapeForType(node.type);
  const point = perimeterPercentToPoint(slot.perimeterPercent, width, height, nodeShape);
  const origin = nodeAbsolutePosition(node, getNode);
  return {
    x: origin.x + (point.leftPercent / 100) * width,
    y: origin.y + (point.topPercent / 100) * height,
  };
}

/** Perimeter jack anchor + outward direction for cable stubs and SVG ports. */
export function handleFlowAnchor(
  node: Node,
  handleId: string | null | undefined,
  getNode: (id: string) => Node | undefined,
  shape?: HandleNodeShape,
): HandleFlowAnchor | null {
  if (!handleId) return null;
  const slots = (node.data as { connectionHandles?: ConnectionHandleSlot[] }).connectionHandles;
  const slot = slots?.find((s) => s.id === handleId);
  if (!slot) return null;

  const { width, height } = nodeLocalSize(node);
  const nodeShape = shape ?? nodeShapeForType(node.type);
  const perim = perimeterPercentToPoint(slot.perimeterPercent, width, height, nodeShape);
  const origin = nodeAbsolutePosition(node, getNode);
  const x = origin.x + (perim.leftPercent / 100) * width;
  const y = origin.y + (perim.topPercent / 100) * height;
  const side = POSITION_TO_SIDE[perim.position];

  if (nodeShape === "circle") {
    const cx = origin.x + width / 2;
    const cy = origin.y + height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x, y, side, outwardX: dx / len, outwardY: dy / len };
  }

  const out = SIDE_OUTWARD[side];
  return { x, y, side, outwardX: out.x, outwardY: out.y };
}
