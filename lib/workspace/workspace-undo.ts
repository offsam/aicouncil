import type { Node } from "@xyflow/react";
import type { AgentAssignmentRow, ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import type { WorkspaceMeta } from "@/lib/workspace/constants";
import type { WorkspaceConnectionRow } from "@/lib/workspace/workspace-connections";

export const MAX_WORKSPACE_UNDO = 50;

export type WorkspaceUndoSnapshot = {
  nodes: Node[];
  connections: WorkspaceConnectionRow[];
  canvasBg: string;
  workspaceMeta: WorkspaceMeta;
  routeLookup: {
    chambers: ChamberRow[];
    buildings: OfficeObjectRow[];
    assignments: AgentAssignmentRow[];
  };
  chamberCounts: [string, number][];
};

export function cloneWorkspaceUndoSnapshot(input: {
  nodes: Node[];
  connections: WorkspaceConnectionRow[];
  canvasBg: string;
  workspaceMeta: WorkspaceMeta;
  routeLookup: WorkspaceUndoSnapshot["routeLookup"];
  chamberCounts: Map<string, number>;
}): WorkspaceUndoSnapshot {
  return {
    nodes: structuredClone(input.nodes),
    connections: structuredClone(input.connections),
    canvasBg: input.canvasBg,
    workspaceMeta: structuredClone(input.workspaceMeta),
    routeLookup: structuredClone(input.routeLookup),
    chamberCounts: [...input.chamberCounts.entries()],
  };
}
