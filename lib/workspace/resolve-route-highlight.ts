import type { ChatWorkflowStep, ExecuteChatTaskResult } from "@/lib/execute-chat-task";
import type { AgentAssignmentRow, ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import { workspaceAssignmentNodeId } from "./agent-nodes";
import { resolveCityHallBuildingId } from "./city-hall-building";

export type RouteHighlightStep = {
  nodeId: string;
  step: number;
  label: string;
};

export type RouteHighlightResult = {
  steps: RouteHighlightStep[];
  connectionIds: string[];
};

const STEP_MARKERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"] as const;

export function routeStepMarker(step: number): string {
  return STEP_MARKERS[step - 1] ?? String(step);
}

export function formatRoutePath(steps: RouteHighlightStep[]): string {
  return steps.map((s) => s.label).join(" → ");
}

export function formatWorkflowSidebar(steps: ChatWorkflowStep[]): string {
  const total = steps.length;
  const lines = steps.map(
    (s) => `Step ${s.step_order}/${total} ${s.target_chamber?.name ?? "?"}`,
  );
  return `Workflow:\n${lines.join("\n")}`;
}

function findAssignmentForRoute(
  chamberDbId: string,
  agentId: string | null | undefined,
  assignments: AgentAssignmentRow[],
): AgentAssignmentRow | undefined {
  if (!agentId) return undefined;
  return assignments.find((a) => a.chamber_id === chamberDbId && a.agent_id === agentId);
}

function appendParticipatingAgents(
  steps: RouteHighlightStep[],
  stepNum: number,
  targetChamber: ChamberRow,
  result: ExecuteChatTaskResult,
  assignments: AgentAssignmentRow[],
): { steps: RouteHighlightStep[]; stepNum: number } {
  if (result.mode === "workflow") return { steps, stepNum };

  const participants =
    result.council?.agents ?? result.team?.agents ?? [];
  if (participants.length === 0) {
    const assignment = findAssignmentForRoute(targetChamber.id, result.agentId, assignments);
    if (assignment) {
      steps.push({
        nodeId: workspaceAssignmentNodeId(assignment.id),
        step: stepNum++,
        label: result.agentName ?? assignment.agents?.name ?? "Agent",
      });
    }
    return { steps, stepNum };
  }

  for (const agent of participants) {
    if (agent.status !== "success") continue;
    const assignment = findAssignmentForRoute(targetChamber.id, agent.agentId, assignments);
    if (assignment) {
      steps.push({
        nodeId: workspaceAssignmentNodeId(assignment.id),
        step: stepNum++,
        label: agent.agentName,
      });
    }
  }

  return { steps, stepNum };
}

export function resolveRouteHighlight(
  result: ExecuteChatTaskResult,
  chambers: ChamberRow[],
  buildings: OfficeObjectRow[],
  assignments: AgentAssignmentRow[] = [],
): RouteHighlightResult | null {
  if (result.mode === "workflow") return null;

  const cityHallId = resolveCityHallBuildingId(buildings);

  const targetId = result.routing.targets[0]?.entityRegistryId;
  if (!targetId) return null;

  const connectionIds: string[] = [];
  if (result.routing.usedConnectionId) {
    connectionIds.push(result.routing.usedConnectionId);
  }

  const targetChamber = chambers.find((c) => c.entity_registry_id === targetId);
  const viaId = result.routing.routeViaEntityId;
  const viaChamber = viaId ? chambers.find((c) => c.entity_registry_id === viaId) : undefined;

  if (targetChamber && viaChamber && viaId !== targetId && result.routing.usedConnectionId) {
    const buildingId = targetChamber.building_object_id || targetChamber.building_entity_id;
    const building = buildings.find((b) => b.id === buildingId);
    let stepNum = 1;
    let steps: RouteHighlightStep[] = [
      ...(cityHallId
        ? [{ nodeId: cityHallId, step: stepNum++, label: "City Hall" }]
        : []),
      {
        nodeId: buildingId,
        step: stepNum++,
        label: building?.label ?? "Building",
      },
      { nodeId: viaId!, step: stepNum++, label: viaChamber.name },
      {
        nodeId: targetId,
        step: stepNum++,
        label: result.targetName ?? targetChamber.name,
      },
    ];

    ({ steps, stepNum } = appendParticipatingAgents(
      steps,
      stepNum,
      targetChamber,
      result,
      assignments,
    ));

    return { steps, connectionIds };
  }

  if (targetChamber) {
    const buildingId = targetChamber.building_object_id || targetChamber.building_entity_id;
    const building = buildings.find((b) => b.id === buildingId);
    let stepNum = 1;
    let steps: RouteHighlightStep[] = [
      ...(cityHallId
        ? [{ nodeId: cityHallId, step: stepNum++, label: "City Hall" }]
        : []),
      {
        nodeId: buildingId,
        step: stepNum++,
        label: building?.label ?? "Building",
      },
      {
        nodeId: targetId,
        step: stepNum++,
        label: result.targetName ?? targetChamber.name,
      },
    ];

    ({ steps, stepNum } = appendParticipatingAgents(
      steps,
      stepNum,
      targetChamber,
      result,
      assignments,
    ));

    return { steps, connectionIds };
  }

  const building = buildings.find((b) => b.id === targetId);
  if (building) {
    return {
      steps: [
        ...(cityHallId
          ? [{ nodeId: cityHallId, step: 1, label: "City Hall" }]
          : []),
        {
          nodeId: targetId,
          step: cityHallId ? 2 : 1,
          label: building.label ?? result.targetName ?? "Building",
        },
      ],
      connectionIds,
    };
  }

  return null;
}
