import type { AgentAssignmentRow } from "@/lib/office-types";

export function workspaceAssignmentNodeId(assignmentId: string): string {
  return `assignment-${assignmentId}`;
}

export type WorkspaceAssignmentInput = AgentAssignmentRow;
