import type { Node } from "@xyflow/react";
import type { AgentNodeData } from "./build-workspace-graph";

/** Map a canvas node to its entity_registry id (connections always use registry ids). */
export function nodeToEntityRegistryId(node: Node): string | null {
  if (node.type === "chamber" || node.type === "building") return node.id;
  if (node.type === "agent") return (node.data as AgentNodeData).agentId;
  return null;
}

export function findNodeByEntityRegistryId(
  nodes: Node[],
  registryId: string,
): Node | undefined {
  return nodes.find((n) => nodeToEntityRegistryId(n) === registryId);
}

export function isConnectableNode(node: Node): boolean {
  return node.type === "chamber" || node.type === "building" || node.type === "agent";
}

export function activeConnectionBetween(
  connections: { source_entity_id: string; target_entity_id: string; is_active: boolean }[],
  sourceId: string,
  targetId: string,
): boolean {
  return connections.some(
    (c) =>
      c.is_active &&
      c.source_entity_id === sourceId &&
      c.target_entity_id === targetId,
  );
}
