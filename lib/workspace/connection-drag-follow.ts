import type { Edge, Node } from "@xyflow/react";
import type { ConnectionRoutePath } from "@/lib/office-types";
import { nodeAbsolutePosition } from "./connection-handle-flow-coords";
import { translateRoutePath } from "./connection-route-path";
import type { ConnectionEdgeData } from "./workspace-connections";

export type ConnectionDragFollowState = {
  movingNodeIds: Set<string>;
  dx: number;
  dy: number;
} | null;

/** All descendant React Flow node ids (chambers, agents, …). */
export function collectDescendantNodeIds(rootId: string, nodes: Node[]): Set<string> {
  const ids = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const n of nodes) {
      if (n.parentId === id && !ids.has(n.id)) {
        ids.add(n.id);
        stack.push(n.id);
      }
    }
  }
  return ids;
}

/** Node ids that move with the dragged node (itself + nested children). */
export function collectMovingNodeIds(draggedNode: Node, nodes: Node[]): Set<string> {
  const ids = new Set<string>([draggedNode.id]);
  for (const id of collectDescendantNodeIds(draggedNode.id, nodes)) {
    ids.add(id);
  }
  return ids;
}

/** Nodes whose handle geometry must refresh while dragging. */
export function nodesToRefreshOnDrag(draggedNode: Node, nodes: Node[], edges: Edge[]): string[] {
  const moving = collectMovingNodeIds(draggedNode, nodes);
  const refresh = new Set<string>();
  for (const id of moving) refresh.add(id);
  for (const e of edges) {
    if (moving.has(e.source) || moving.has(e.target)) {
      refresh.add(e.source);
      refresh.add(e.target);
    }
  }
  return [...refresh];
}

export function absolutePositionAtDragStart(
  node: Node,
  getNode: (id: string) => Node | undefined,
): { x: number; y: number } {
  return nodeAbsolutePosition(node, getNode);
}

export function applyDragRouteTranslation(
  dx: number,
  dy: number,
  movingNodeIds: Set<string>,
  edges: Edge[],
  getRoutePath: (connectionId: string) => ConnectionRoutePath | null | undefined,
  onRoutePathChange: (connectionId: string, routePath: ConnectionRoutePath | null) => void,
): void {
  if (dx === 0 && dy === 0) return;
  const seen = new Set<string>();
  for (const edge of edges) {
    if (!movingNodeIds.has(edge.source) || !movingNodeIds.has(edge.target)) continue;
    const connId = (edge.data as ConnectionEdgeData | undefined)?.connectionId;
    if (!connId || seen.has(connId)) continue;
    seen.add(connId);
    const routePath = getRoutePath(connId);
    if (!routePath?.points?.length) continue;
    onRoutePathChange(connId, translateRoutePath(routePath, dx, dy));
  }
}
