import type { Node } from "@xyflow/react";
import type { BuildingNodeData, ChamberNodeData } from "./build-workspace-graph";

export function patchBuildingHeaderMetrics(
  nodes: Node[],
  buildingId: string,
  patch: Partial<Pick<BuildingNodeData, "chamberCount" | "agentCount">>,
): Node[] {
  return nodes.map((n) => {
    if (n.id !== buildingId || n.type !== "building") return n;
    const d = n.data as BuildingNodeData;
    return {
      ...n,
      data: {
        ...d,
        ...(patch.chamberCount !== undefined ? { chamberCount: patch.chamberCount } : {}),
        ...(patch.agentCount !== undefined ? { agentCount: patch.agentCount } : {}),
      },
    };
  });
}

export function patchChamberHeaderMetrics(
  nodes: Node[],
  chamberRegistryId: string,
  patch: Partial<Pick<ChamberNodeData, "agentCount">>,
): Node[] {
  return nodes.map((n) => {
    if (n.id !== chamberRegistryId || n.type !== "chamber") return n;
    const d = n.data as ChamberNodeData;
    return {
      ...n,
      data: {
        ...d,
        ...(patch.agentCount !== undefined ? { agentCount: patch.agentCount } : {}),
      },
    };
  });
}

export function bumpBuildingMetrics(
  nodes: Node[],
  buildingId: string,
  delta: { chambers?: number; agents?: number },
): Node[] {
  const building = nodes.find((n) => n.id === buildingId && n.type === "building");
  if (!building) return nodes;
  const d = building.data as BuildingNodeData;
  return patchBuildingHeaderMetrics(nodes, buildingId, {
    chamberCount: Math.max(0, (d.chamberCount ?? 0) + (delta.chambers ?? 0)),
    agentCount: Math.max(0, (d.agentCount ?? 0) + (delta.agents ?? 0)),
  });
}

export function bumpChamberAgentCount(
  nodes: Node[],
  chamberRegistryId: string,
  delta: number,
): Node[] {
  const chamber = nodes.find((n) => n.id === chamberRegistryId && n.type === "chamber");
  if (!chamber) return nodes;
  const d = chamber.data as ChamberNodeData;
  return patchChamberHeaderMetrics(nodes, chamberRegistryId, {
    agentCount: Math.max(0, (d.agentCount ?? 0) + delta),
  });
}

export function agentNodeBuildingId(nodes: Node[], agentNode: Node): string | null {
  const parentId = agentNode.parentId;
  if (!parentId) return null;
  const chamber = nodes.find((n) => n.id === parentId && n.type === "chamber");
  if (!chamber) return null;
  return (chamber.data as ChamberNodeData).buildingId;
}

export function agentNodeRegistryId(agentNode: Node): string | null {
  return agentNode.parentId ?? null;
}
