import type { ChatWorkflowStep } from "@/lib/execute-chat-task";
import type { AgentAssignmentRow, ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import { workspaceAssignmentNodeId } from "./agent-nodes";
import { resolveCityHallBuildingId } from "./city-hall-building";
import type { RouteHighlightStep } from "./resolve-route-highlight";

export type WorkflowStepIds = {
  cityId: string;
  buildingId: string;
  chamberId: string;
  agentId: string | null;
};

export type WorkflowStepHighlightResult = WorkflowStepIds & {
  steps: RouteHighlightStep[];
  connectionIds: string[];
  targetLabel: string;
  stepOrder: number;
  stepTotal: number;
};

function findAssignmentForStep(
  chamberDbId: string,
  agentId: string | null | undefined,
  assignments: AgentAssignmentRow[],
): AgentAssignmentRow | undefined {
  if (!agentId) return undefined;
  return assignments.find((a) => a.chamber_id === chamberDbId && a.agent_id === agentId);
}

export function resolveWorkflowStepHighlight(
  step: ChatWorkflowStep,
  chambers: ChamberRow[],
  buildings: OfficeObjectRow[],
  assignments: AgentAssignmentRow[] = [],
): WorkflowStepHighlightResult | null {
  const targetEntityId = step.target_chamber?.id;
  if (!targetEntityId) return null;

  const targetChamber = chambers.find((c) => c.entity_registry_id === targetEntityId);
  if (!targetChamber) return null;

  const buildingId = targetChamber.building_object_id || targetChamber.building_entity_id;
  const building = buildings.find((b) => b.id === buildingId);
  const cityHallId = resolveCityHallBuildingId(buildings);

  let stepNum = 1;
  const routeSteps: RouteHighlightStep[] = [
    ...(cityHallId ? [{ nodeId: cityHallId, step: stepNum++, label: "City Hall" }] : []),
    {
      nodeId: buildingId,
      step: stepNum++,
      label: building?.label ?? "Building",
    },
    {
      nodeId: targetEntityId,
      step: stepNum++,
      label: step.target_chamber?.name ?? targetChamber.name,
    },
  ];

  const agentDbId = step.assigned_agent?.id ?? null;
  const assignment = findAssignmentForStep(targetChamber.id, agentDbId, assignments);
  let agentNodeId: string | null = null;

  if (assignment) {
    agentNodeId = workspaceAssignmentNodeId(assignment.id);
    routeSteps.push({
      nodeId: agentNodeId,
      step: stepNum++,
      label: step.assigned_agent?.name ?? assignment.agents?.name ?? "Agent",
    });
  }

  return {
    cityId: cityHallId ?? "",
    buildingId,
    chamberId: targetEntityId,
    agentId: agentNodeId,
    steps: routeSteps,
    connectionIds: [],
    targetLabel: step.target_chamber?.name ?? targetChamber.name,
    stepOrder: step.step_order,
    stepTotal: 0,
  };
}

export function resolveWorkflowHighlight(
  steps: ChatWorkflowStep[],
  chambers: ChamberRow[],
  buildings: OfficeObjectRow[],
  assignments: AgentAssignmentRow[] = [],
): WorkflowStepHighlightResult[] {
  const sorted = steps.slice().sort((a, b) => a.step_order - b.step_order);
  const total = sorted.length;

  return sorted
    .map((s) => {
      const resolved = resolveWorkflowStepHighlight(s, chambers, buildings, assignments);
      if (!resolved) return null;
      return { ...resolved, stepTotal: total };
    })
    .filter((r): r is WorkflowStepHighlightResult => r != null);
}
