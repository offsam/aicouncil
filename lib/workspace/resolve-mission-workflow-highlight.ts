import type { ChatWorkflowStep } from "@/lib/execute-chat-task";
import type { AgentAssignmentRow, ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import type {
  WorkspacePendingWorkflow,
  WorkspacePendingWorkflowStep,
} from "@/lib/mission-workspace-bridge";
import {
  resolveWorkflowStepHighlight,
  type WorkflowStepHighlightResult,
} from "./resolve-workflow-highlight";

export function bridgeStepsToChatSteps(steps: WorkspacePendingWorkflowStep[]): ChatWorkflowStep[] {
  return steps.map((s) => ({
    step_order: s.step_order,
    status: s.status,
    input_summary: s.input_summary,
    output_summary: s.output_summary,
    target_chamber: s.target_chamber
      ? {
          id: s.target_chamber.id,
          name: s.target_chamber.name,
          entity_type: s.target_chamber.entity_type ?? "chamber",
        }
      : null,
    assigned_agent: s.assigned_agent ?? null,
  }));
}

/** Current step for live MC → Workspace sync (in_progress, else last completed, else first). */
export function pickLiveMissionWorkflowStep(steps: ChatWorkflowStep[]): ChatWorkflowStep | null {
  const sorted = steps.slice().sort((a, b) => a.step_order - b.step_order);
  const inProgress = sorted.find((s) => s.status === "in_progress");
  if (inProgress) return inProgress;

  const completed = sorted.filter((s) => s.status === "completed");
  if (completed.length) return completed[completed.length - 1]!;

  return sorted[0] ?? null;
}

export function resolveMissionWorkflowLiveHighlight(
  pending: WorkspacePendingWorkflow,
  chambers: ChamberRow[],
  buildings: OfficeObjectRow[],
  assignments: AgentAssignmentRow[] = [],
): WorkflowStepHighlightResult | null {
  const chatSteps = bridgeStepsToChatSteps(pending.steps);
  const current = pickLiveMissionWorkflowStep(chatSteps);
  if (!current) return null;

  const resolved = resolveWorkflowStepHighlight(current, chambers, buildings, assignments);
  if (!resolved) return null;

  return { ...resolved, stepTotal: pending.steps.length };
}
