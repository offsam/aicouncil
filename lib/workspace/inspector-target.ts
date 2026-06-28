import type { Edge, Node } from "@xyflow/react";
import type {
  AgentNodeData,
  BuildingNodeData,
  ChamberNodeData,
  CityHallNodeData,
} from "./build-workspace-graph";
import type { ConnectionEdgeData } from "./workspace-connections";
import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";

/** Stable selection handle — reusable by Workspace and future City View. */
export type InspectorTargetKind = "city" | "building" | "chamber" | "agent" | "connection";

export type InspectorTarget =
  | {
      kind: "city";
      officeId: string;
      label: string;
    }
  | {
      kind: "building";
      officeId: string;
      buildingId: string;
      label: string;
    }
  | {
      kind: "chamber";
      officeId: string;
      buildingId: string;
      chamberId: string;
      registryId: string;
      label: string;
    }
  | {
      kind: "agent";
      officeId: string;
      assignmentId: string;
      agentId: string;
      chamberId: string;
      chamberRegistryId: string;
      buildingId: string;
      label: string;
      provider: string;
      modelId: string;
      costTier: string;
      layoutX: number | null;
      layoutY: number | null;
    }
  | {
      kind: "connection";
      connectionId: string;
      sourceRegistryId: string;
      targetRegistryId: string;
      sourceLabel: string;
      targetLabel: string;
    };

export function inspectorTargetKey(target: InspectorTarget | null): string | null {
  if (!target) return null;
  switch (target.kind) {
    case "city":
      return `city:${target.officeId}`;
    case "building":
      return `building:${target.buildingId}`;
    case "chamber":
      return `chamber:${target.registryId}`;
    case "agent":
      return `agent:${target.assignmentId}`;
    case "connection":
      return `connection:${target.connectionId}`;
  }
}

export function resolveInspectorTargetFromNode(
  node: Node,
  officeId: string = AI_COUNCIL_OFFICE_ID,
): InspectorTarget | null {
  switch (node.type) {
    case "cityHall": {
      const d = node.data as CityHallNodeData;
      return { kind: "city", officeId, label: d.label };
    }
    case "building": {
      const d = node.data as BuildingNodeData;
      return {
        kind: "building",
        officeId,
        buildingId: d.buildingId,
        label: d.label,
      };
    }
    case "chamber": {
      const d = node.data as ChamberNodeData;
      return {
        kind: "chamber",
        officeId,
        buildingId: d.buildingId,
        chamberId: d.chamberId,
        registryId: d.entityRegistryId,
        label: d.label,
      };
    }
    case "agent": {
      const d = node.data as AgentNodeData;
      return {
        kind: "agent",
        officeId,
        assignmentId: d.assignmentId,
        agentId: d.agentId,
        chamberId: d.chamberDbId,
        chamberRegistryId: node.parentId ?? "",
        buildingId: "",
        label: d.label,
        provider: d.provider,
        modelId: d.modelId,
        costTier: d.costTier,
        layoutX: null,
        layoutY: null,
      };
    }
    default:
      return null;
  }
}

export function resolveInspectorTargetFromEdge(
  edge: Edge,
  chamberLabelById: (registryId: string) => string,
): InspectorTarget | null {
  const d = edge.data as ConnectionEdgeData | undefined;
  const connectionId = d?.connectionId;
  if (!connectionId) return null;

  const sourceRegistryId = edge.source;
  const targetRegistryId = edge.target;

  return {
    kind: "connection",
    connectionId,
    sourceRegistryId,
    targetRegistryId,
    sourceLabel: d?.sourceName ?? chamberLabelById(sourceRegistryId),
    targetLabel: d?.targetName ?? chamberLabelById(targetRegistryId),
  };
}
