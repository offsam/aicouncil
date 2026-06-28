import type { ExecuteChatTaskResult } from "@/lib/execute-chat-task";
import type { AgentAssignmentRow, ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import { workspaceAssignmentNodeId } from "./agent-nodes";
import { resolveCityHallBuildingId } from "./city-hall-building";
import {
  resolveRouteHighlight,
  type RouteHighlightResult,
  type RouteHighlightStep,
} from "./resolve-route-highlight";

export type RouteAnimationSegment =
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; connectionId: string }
  | { kind: "processing"; chamberNodeId: string; agentNodeIds: string[] };

export type MayorRouteOrigin = {
  agentId: string;
  chamberRegistryId: string;
};

export type RouteAnimationPlan = RouteHighlightResult & {
  segments: RouteAnimationSegment[];
};

function resolveAgentNodeId(
  agentId: string,
  chamberRegistryId: string,
  chambers: ChamberRow[],
  assignments: AgentAssignmentRow[],
): string | null {
  const chamber = chambers.find((c) => c.entity_registry_id === chamberRegistryId);
  if (!chamber) return null;
  const assignment = assignments.find(
    (a) => a.chamber_id === chamber.id && a.agent_id === agentId,
  );
  return assignment ? workspaceAssignmentNodeId(assignment.id) : null;
}

function collectTargetAgentNodeIds(
  result: ExecuteChatTaskResult,
  targetChamber: ChamberRow | undefined,
  assignments: AgentAssignmentRow[],
): string[] {
  if (!targetChamber || result.mode === "workflow") return [];

  const participants =
    result.council?.agents ?? result.team?.agents ?? result.fast?.agents ?? [];
  const agentIds =
    participants.length > 0
      ? participants.map((a) => a.agentId)
      : result.agentId
        ? [result.agentId]
        : [];

  const nodeIds: string[] = [];
  for (const agentId of agentIds) {
    const nodeId = resolveAgentNodeId(
      agentId,
      targetChamber.entity_registry_id,
      [targetChamber],
      assignments,
    );
    if (nodeId) nodeIds.push(nodeId);
  }
  return nodeIds;
}

function collectRosterAgentNodeIds(
  rosterAgentIds: string[],
  chamberRegistryId: string,
  chambers: ChamberRow[],
  assignments: AgentAssignmentRow[],
): string[] {
  const nodeIds: string[] = [];
  for (const agentId of rosterAgentIds) {
    const nodeId = resolveAgentNodeId(agentId, chamberRegistryId, chambers, assignments);
    if (nodeId) nodeIds.push(nodeId);
  }
  return nodeIds;
}

function isAgentNodeId(nodeId: string): boolean {
  return nodeId.startsWith("assignment-");
}

function isBuildingNodeId(
  nodeId: string,
  buildings: OfficeObjectRow[],
): boolean {
  return buildings.some((b) => b.id === nodeId);
}

export function buildRouteAnimationPlan(
  result: ExecuteChatTaskResult,
  chambers: ChamberRow[],
  buildings: OfficeObjectRow[],
  assignments: AgentAssignmentRow[] = [],
  mayorOrigin?: MayorRouteOrigin | null,
  rosterAgentIds: string[] = [],
): RouteAnimationPlan | null {
  if (result.mode === "workflow") return null;

  const resolved = resolveRouteHighlight(result, chambers, buildings, assignments);
  if (!resolved?.steps.length) return null;

  const cityHallId = resolveCityHallBuildingId(buildings);
  const targetId = result.routing.targets[0]?.entityRegistryId;
  const targetChamber = targetId
    ? chambers.find((c) => c.entity_registry_id === targetId)
    : undefined;

  const segments: RouteAnimationSegment[] = [];
  const seenNodes = new Set<string>();

  const pushNode = (nodeId: string) => {
    if (seenNodes.has(nodeId) || isBuildingNodeId(nodeId, buildings)) return;
    seenNodes.add(nodeId);
    segments.push({ kind: "node", nodeId });
  };

  if (mayorOrigin) {
    const mayorAgentNodeId = resolveAgentNodeId(
      mayorOrigin.agentId,
      mayorOrigin.chamberRegistryId,
      chambers,
      assignments,
    );
    if (mayorAgentNodeId) pushNode(mayorAgentNodeId);
    pushNode(mayorOrigin.chamberRegistryId);
  }

  const mainConnectionId = result.routing.usedConnectionId;
  if (mainConnectionId) {
    segments.push({ kind: "edge", connectionId: mainConnectionId });
  }

  const agentSteps: string[] = [];
  for (const step of resolved.steps) {
    if (step.nodeId === cityHallId) continue;
    if (isAgentNodeId(step.nodeId)) {
      agentSteps.push(step.nodeId);
      continue;
    }
    pushNode(step.nodeId);
  }

  const primaryAgentNodeId = agentSteps[0];
  if (primaryAgentNodeId) {
    pushNode(primaryAgentNodeId);
  }

  const processingChamberId =
    [...resolved.steps]
      .reverse()
      .find((s) => !isAgentNodeId(s.nodeId) && s.nodeId !== cityHallId)?.nodeId ??
    targetId ??
    resolved.steps[resolved.steps.length - 1]?.nodeId;

  let processingAgentNodeIds =
    agentSteps.length > 0
      ? agentSteps
      : collectTargetAgentNodeIds(result, targetChamber, assignments);

  if (processingAgentNodeIds.length === 0 && rosterAgentIds.length > 0 && targetId) {
    processingAgentNodeIds = collectRosterAgentNodeIds(
      rosterAgentIds,
      targetId,
      chambers,
      assignments,
    );
  }

  if (processingChamberId && !isBuildingNodeId(processingChamberId, buildings)) {
    segments.push({
      kind: "processing",
      chamberNodeId: processingChamberId,
      agentNodeIds: processingAgentNodeIds,
    });
  } else if (processingAgentNodeIds.length > 0) {
    segments.push({
      kind: "processing",
      chamberNodeId: processingChamberId ?? processingAgentNodeIds[0]!,
      agentNodeIds: processingAgentNodeIds,
    });
  }

  return {
    ...resolved,
    segments,
  };
}

export function segmentAt(
  plan: RouteAnimationPlan,
  index: number,
): RouteAnimationSegment | null {
  if (index < 0 || index >= plan.segments.length) return null;
  return plan.segments[index] ?? null;
}

export function lastOutboundSegmentIndex(plan: RouteAnimationPlan): number {
  const processingIdx = plan.segments.findIndex((s) => s.kind === "processing");
  return processingIdx >= 0 ? processingIdx : plan.segments.length - 1;
}

export function isProcessingSegmentIndex(plan: RouteAnimationPlan, index: number): boolean {
  return plan.segments[index]?.kind === "processing";
}

export function stepsForDisplay(steps: RouteHighlightStep[]): RouteHighlightStep[] {
  return steps;
}
