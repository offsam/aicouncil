import type { Node } from "@xyflow/react";
import { Position } from "@xyflow/react";
import {
  legacySlotToPerimeterPercent,
  normalizeSlotPerimeterPercent,
  perimeterPercentToPoint,
} from "./connection-handle-perimeter";
import type { WorkspaceConnectionRow } from "./workspace-connections";

export type ConnectionSide = "left" | "right" | "top" | "bottom";

export type ConnectionHandleSlot = {
  id: string;
  type: "source" | "target";
  /** 0–100 arc-length along node perimeter (clockwise from top-left). */
  perimeterPercent: number;
  /** @deprecated derived for compatibility */
  position?: Position;
  /** @deprecated derived for compatibility */
  offsetPercent?: number;
};

export type ConnectionHandleAssignment = {
  sourceHandle: string;
  targetHandle: string;
};

function defaultHandleId(type: "source" | "target"): string {
  return type === "source" ? "source-right-0" : "target-left-0";
}

/** Coerce a handle id to the expected endpoint type (source-* / target-*). */
export function coerceHandleId(handleId: string, want: "source" | "target"): string {
  const trimmed = handleId.trim();
  if (!trimmed) return defaultHandleId(want);
  if (trimmed.startsWith(`${want}-`)) return trimmed;

  const suffix = trimmed.replace(/^(source|target)-/, "");
  const flipped = `${want}-${suffix}`;
  if (DEFAULT_CONNECTION_HANDLES.some((slot) => slot.id === flipped)) {
    return flipped;
  }

  const sameSide = DEFAULT_CONNECTION_HANDLES.find(
    (slot) => slot.type === want && slot.id.endsWith(suffix.split("-").slice(-1)[0] ?? ""),
  );
  if (sameSide) return sameSide.id;

  return defaultHandleId(want);
}

/** Fix RF connect payloads where users drag from target ports or sides get inverted. */
export function normalizeConnectionHandleAssignment(
  assignment: ConnectionHandleAssignment,
): ConnectionHandleAssignment {
  return {
    sourceHandle: coerceHandleId(assignment.sourceHandle, "source"),
    targetHandle: coerceHandleId(assignment.targetHandle, "target"),
  };
}

export function normalizeConnectionHandleAssignments<
  T extends ConnectionHandleAssignment,
>(assignments: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [connectionId, assignment] of Object.entries(assignments)) {
    out[connectionId] = {
      ...assignment,
      ...normalizeConnectionHandleAssignment(assignment),
    };
  }
  return out;
}

export type ConnectionHandleOverrides = Record<string, Record<string, number>>;

const SIDE_TO_POSITION: Record<ConnectionSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

function nodeSize(node: Node): { width: number; height: number } {
  const w = Number(node.style?.width ?? node.width ?? 120);
  const h = Number(node.style?.height ?? node.height ?? 80);
  return { width: w, height: h };
}

function nodeCenter(node: Node, nodeById: Map<string, Node>): { x: number; y: number } {
  const { width, height } = nodeSize(node);
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  while (parentId) {
    const parent = nodeById.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return {
    x: x + width / 2,
    y: y + height / 2,
  };
}

function pickSides(
  sourceNode: Node,
  targetNode: Node,
  nodeById: Map<string, Node>,
): { sourceSide: ConnectionSide; targetSide: ConnectionSide } {
  const sc = nodeCenter(sourceNode, nodeById);
  const tc = nodeCenter(targetNode, nodeById);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceSide: "right", targetSide: "left" }
      : { sourceSide: "left", targetSide: "right" };
  }

  return dy >= 0
    ? { sourceSide: "bottom", targetSide: "top" }
    : { sourceSide: "top", targetSide: "bottom" };
}

function sideToPerimeterPercent(
  side: ConnectionSide,
  index: number,
  count: number,
  node?: Node,
): number {
  const { width, height } = node ? nodeSize(node) : { width: 120, height: 80 };
  const offset = slotOffsetPercent(index, count);
  return legacySlotToPerimeterPercent(SIDE_TO_POSITION[side], offset, width, height);
}

function slotOffsetPercent(index: number, count: number): number {
  if (count <= 1) return 50;
  const margin = 12;
  const span = 100 - margin * 2;
  return margin + (span * index) / (count - 1);
}

function handleId(type: "source" | "target", side: ConnectionSide, index: number): string {
  return `${type}-${side}-${index}`;
}

function enrichSlot(slot: ConnectionHandleSlot, node?: Node): ConnectionHandleSlot {
  const { width, height } = node ? nodeSize(node) : { width: 120, height: 80 };
  const perimeterPercent = normalizeSlotPerimeterPercent(slot, width, height);
  const point = perimeterPercentToPoint(perimeterPercent, width, height, "rect");
  const sideOffset =
    point.position === Position.Top || point.position === Position.Bottom
      ? point.leftPercent
      : point.topPercent;
  return {
    ...slot,
    perimeterPercent,
    position: point.position,
    offsetPercent: sideOffset,
  };
}

export function applyHandleOverrides(
  slots: ConnectionHandleSlot[],
  nodeId: string,
  overrides?: ConnectionHandleOverrides,
  node?: Node,
): ConnectionHandleSlot[] {
  const nodeOverrides = overrides?.[nodeId];
  if (!nodeOverrides) return slots.map((s) => enrichSlot(s, node));

  return slots.map((slot) => {
    const override = nodeOverrides[slot.id];
    if (override == null) return enrichSlot(slot, node);
    return enrichSlot({ ...slot, perimeterPercent: override }, node);
  });
}

/**
 * Assign spread exit/entry handles so multiple cables from the same node use adjacent slots.
 */
export function assignConnectionHandleSlots(
  connections: WorkspaceConnectionRow[],
  nodes: Node[],
  nodeIdForEntity: (entityId: string) => string | null,
  overrides?: ConnectionHandleOverrides,
): {
  assignments: Map<string, ConnectionHandleAssignment>;
  nodeHandles: Map<string, ConnectionHandleSlot[]>;
} {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const sideByConn = new Map<string, { sourceSide: ConnectionSide; targetSide: ConnectionSide }>();

  for (const conn of connections) {
    if (!conn.is_active) continue;
    const sourceNodeId = nodeIdForEntity(conn.source_entity_id);
    const targetNodeId = nodeIdForEntity(conn.target_entity_id);
    if (!sourceNodeId || !targetNodeId) continue;

    const sourceNode = nodeById.get(sourceNodeId);
    const targetNode = nodeById.get(targetNodeId);
    if (!sourceNode || !targetNode) continue;

    const sides = pickSides(sourceNode, targetNode, nodeById);
    sideByConn.set(conn.id, sides);

    const outKey = `${sourceNodeId}:out:${sides.sourceSide}`;
    const inKey = `${targetNodeId}:in:${sides.targetSide}`;
    outgoing.set(outKey, [...(outgoing.get(outKey) ?? []), conn.id]);
    incoming.set(inKey, [...(incoming.get(inKey) ?? []), conn.id]);
  }

  const assignments = new Map<string, ConnectionHandleAssignment>();
  const nodeHandles = new Map<string, ConnectionHandleSlot[]>();
  const nodeHandleKeys = new Map<string, Set<string>>();

  function addNodeHandle(nodeId: string, slot: ConnectionHandleSlot) {
    const keys = nodeHandleKeys.get(nodeId) ?? new Set<string>();
    if (keys.has(slot.id)) return;
    keys.add(slot.id);
    nodeHandleKeys.set(nodeId, keys);
    const node = nodeById.get(nodeId);
    nodeHandles.set(nodeId, [...(nodeHandles.get(nodeId) ?? []), enrichSlot(slot, node)]);
  }

  for (const conn of connections) {
    if (!conn.is_active) continue;
    const sides = sideByConn.get(conn.id);
    if (!sides) continue;

    const sourceNodeId = nodeIdForEntity(conn.source_entity_id);
    const targetNodeId = nodeIdForEntity(conn.target_entity_id);
    if (!sourceNodeId || !targetNodeId) continue;

    const outKey = `${sourceNodeId}:out:${sides.sourceSide}`;
    const inKey = `${targetNodeId}:in:${sides.targetSide}`;
    const outList = outgoing.get(outKey) ?? [conn.id];
    const inList = incoming.get(inKey) ?? [conn.id];

    const outSorted = [...outList].sort();
    const inSorted = [...inList].sort();

    const outIdx = outSorted.indexOf(conn.id);
    const inIdx = inSorted.indexOf(conn.id);

    const sourceHandle = handleId("source", sides.sourceSide, outIdx);
    const targetHandle = handleId("target", sides.targetSide, inIdx);

    assignments.set(conn.id, { sourceHandle, targetHandle });

    const sourceNode = nodeById.get(sourceNodeId);
    const targetNode = nodeById.get(targetNodeId);

    addNodeHandle(sourceNodeId, {
      id: sourceHandle,
      type: "source",
      perimeterPercent: sideToPerimeterPercent(
        sides.sourceSide,
        outIdx,
        outSorted.length,
        sourceNode,
      ),
    });
    addNodeHandle(targetNodeId, {
      id: targetHandle,
      type: "target",
      perimeterPercent: sideToPerimeterPercent(
        sides.targetSide,
        inIdx,
        inSorted.length,
        targetNode,
      ),
    });
  }

  for (const [nodeId, slots] of nodeHandles) {
    nodeHandles.set(
      nodeId,
      applyHandleOverrides(slots, nodeId, overrides, nodeById.get(nodeId)),
    );
  }

  return { assignments, nodeHandles };
}

export const DEFAULT_CONNECTION_HANDLES: ConnectionHandleSlot[] = [
  { id: "source-right-0", type: "source", perimeterPercent: 31 },
  { id: "source-right-1", type: "source", perimeterPercent: 40 },
  { id: "source-right-2", type: "source", perimeterPercent: 49 },
  { id: "target-left-0", type: "target", perimeterPercent: 81 },
  { id: "target-left-1", type: "target", perimeterPercent: 90 },
  { id: "target-left-2", type: "target", perimeterPercent: 99 },
  { id: "source-bottom-0", type: "source", perimeterPercent: 56 },
  { id: "source-bottom-1", type: "source", perimeterPercent: 69 },
  { id: "target-top-0", type: "target", perimeterPercent: 6 },
  { id: "target-top-1", type: "target", perimeterPercent: 19 },
  { id: "source-top-0", type: "source", perimeterPercent: 12 },
  { id: "target-right-0", type: "target", perimeterPercent: 44 },
  { id: "source-left-0", type: "source", perimeterPercent: 75 },
  { id: "target-bottom-0", type: "target", perimeterPercent: 62 },
];

/** Spread positions for user-added ports along the perimeter. */
export const CUSTOM_PORT_PERCENTS = [8, 25, 42, 58, 75, 92] as const;

export function resolveHandleSlotTemplate(
  handleId: string,
  type: "source" | "target",
): ConnectionHandleSlot {
  const fromDefault = DEFAULT_CONNECTION_HANDLES.find((slot) => slot.id === handleId);
  if (fromDefault && fromDefault.type === type) return { ...fromDefault };
  const coercedId = coerceHandleId(handleId, type);
  const coercedDefault = DEFAULT_CONNECTION_HANDLES.find((slot) => slot.id === coercedId);
  if (coercedDefault) return { ...coercedDefault };
  return { id: coercedId, type, perimeterPercent: 50 };
}

/** Ensure a handle id used by an edge exists in node slot data (for anchors + jack chrome). */
export function ensureNodeHandleSlot(
  nodeHandles: Map<string, ConnectionHandleSlot[]>,
  nodeId: string,
  handleId: string,
  type: "source" | "target",
  node?: Node,
): void {
  const existing = nodeHandles.get(nodeId) ?? [];
  if (existing.some((slot) => slot.id === handleId)) return;
  nodeHandles.set(nodeId, [
    ...existing,
    enrichSlot(resolveHandleSlotTemplate(handleId, type), node),
  ]);
}

export function pruneConnectionHandleAssignments<
  T extends { sourceHandle: string; targetHandle: string },
>(
  assignments: Record<string, T>,
  connections: { id: string; is_active: boolean }[],
): Record<string, T> {
  const activeIds = new Set(
    connections.filter((connection) => connection.is_active).map((connection) => connection.id),
  );
  const pruned = Object.fromEntries(
    Object.entries(assignments).filter(([connectionId]) => activeIds.has(connectionId)),
  );
  return normalizeConnectionHandleAssignments(pruned);
}

export function mergeExtraConnectionHandles(
  assigned: ConnectionHandleSlot[],
  extra: ConnectionHandleSlot[] | undefined,
  nodeId: string,
  overrides: ConnectionHandleOverrides | undefined,
  node?: Node,
): ConnectionHandleSlot[] {
  const byId = new Map<string, ConnectionHandleSlot>();
  for (const slot of assigned) byId.set(slot.id, slot);
  for (const slot of extra ?? []) {
    if (!byId.has(slot.id)) byId.set(slot.id, slot);
  }
  const merged = [...byId.values()];
  return applyHandleOverrides(merged, nodeId, overrides, node);
}

export function createCustomHandleSlot(
  type: "source" | "target",
  perimeterPercent: number,
  existingIds: Set<string>,
): ConnectionHandleSlot {
  let n = 0;
  let id = `custom-${type}-${n}`;
  while (existingIds.has(id)) {
    n += 1;
    id = `custom-${type}-${n}`;
  }
  return { id, type, perimeterPercent };
}
