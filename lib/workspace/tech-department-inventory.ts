import type { Edge, Node } from "@xyflow/react";
import type { TechDepartmentStats } from "@/lib/tech-department-stats";
import type { BuildingNodeData } from "./build-workspace-graph";
import { TECH_DEPARTMENT_BUILDING_ID } from "./tech-department";

/** Inventory counts derivable from canvas graph — no API polling. */
export function computeClientTechInventory(
  nodes: Node[],
  connectionCount: number,
  poolAgentCount: number,
): TechDepartmentStats {
  let buildingsCount = 0;
  let chambersCount = 0;
  let deployedAgents = 0;

  for (const node of nodes) {
    if (node.type === "building") buildingsCount += 1;
    else if (node.type === "chamber") chambersCount += 1;
    else if (node.type === "agent") deployedAgents += 1;
  }

  const totalAgentsInPool = Math.max(poolAgentCount, deployedAgents);
  const benchAgents = Math.max(0, totalAgentsInPool - deployedAgents);

  return {
    deployedAgents,
    availableAgents: deployedAgents,
    onFallbackAgents: 0,
    unavailableAgents: 0,
    benchAgents,
    totalAgentsInPool,
    freeTierDeployed: 0,
    agentsWithApiKey: 0,
    fallbackSwitchesSession: 0,
    fallbackSwitchesToday: 0,
    providersAvailable: 0,
    providersOnFallback: 0,
    providersUnavailable: 0,
    providersIdle: 0,
    activeConnections: connectionCount,
    buildingsCount,
    chambersCount,
    routingDecisionsToday: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function techInventoryFingerprint(
  nodes: Node[],
  connectionCount: number,
  poolAgentCount: number,
): string {
  const inv = computeClientTechInventory(nodes, connectionCount, poolAgentCount);
  return [
    inv.buildingsCount,
    inv.chambersCount,
    inv.deployedAgents,
    inv.benchAgents,
    inv.totalAgentsInPool,
    inv.activeConnections,
  ].join(":");
}

export function patchTechDepartmentInventoryNode(
  nodes: Node[],
  connectionCount: number,
  poolAgentCount: number,
  opts?: { pulse?: boolean },
): Node[] {
  const snapshot = computeClientTechInventory(nodes, connectionCount, poolAgentCount);
  const fingerprint = techInventoryFingerprint(nodes, connectionCount, poolAgentCount);

  return nodes.map((node) => {
    if (node.id !== TECH_DEPARTMENT_BUILDING_ID) return node;
    const data = node.data as BuildingNodeData;
    const prevFingerprint = data.techDeptInventoryFingerprint;
    const changed = prevFingerprint !== fingerprint;
    if (!changed && !opts?.pulse) return node;

    return {
      ...node,
      data: {
        ...data,
        techDeptSnapshot: snapshot,
        techDeptInventoryFingerprint: fingerprint,
        techDeptPulseAt: changed || opts?.pulse ? Date.now() : data.techDeptPulseAt,
      } satisfies BuildingNodeData,
    };
  });
}

export function initialTechDeptSnapshotFromGraph(
  nodes: Node[],
  edges: Edge[],
  poolAgentCount: number,
): { nodes: Node[]; snapshot: TechDepartmentStats } {
  const snapshot = computeClientTechInventory(nodes, edges.length, poolAgentCount);
  const fingerprint = techInventoryFingerprint(nodes, edges.length, poolAgentCount);
  const next = nodes.map((node) => {
    if (node.id !== TECH_DEPARTMENT_BUILDING_ID) return node;
    return {
      ...node,
      data: {
        ...(node.data as BuildingNodeData),
        techDeptSnapshot: snapshot,
        techDeptInventoryFingerprint: fingerprint,
      } satisfies BuildingNodeData,
    };
  });
  return { nodes: next, snapshot };
}
