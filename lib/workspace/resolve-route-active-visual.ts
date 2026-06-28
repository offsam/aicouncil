import type { ExecutionProgressState } from "@/lib/workspace/execution-progress";
import type { RouteHighlightState } from "@/components/workspace/WorkspaceRouteContext";
import type { RouteAnimationSegment } from "@/lib/workspace/route-animation-sequence";

export type RouteActiveVisual = {
  activeNodeIds: Set<string>;
  activeEdgeIds: Set<string>;
  litNodeIds: Set<string>;
  litEdgeIds: Set<string>;
};

function segmentNodeIds(segment: RouteAnimationSegment): string[] {
  if (segment.kind === "node") return [segment.nodeId];
  if (segment.kind === "processing") {
    return [segment.chamberNodeId, ...segment.agentNodeIds];
  }
  return [];
}

function segmentEdgeId(segment: RouteAnimationSegment): string | null {
  return segment.kind === "edge" ? segment.connectionId : null;
}

function applySegmentToSets(
  segment: RouteAnimationSegment,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
  excludeNodeIds: ReadonlySet<string>,
): void {
  const edgeId = segmentEdgeId(segment);
  if (edgeId) edgeIds.add(edgeId);
  for (const nodeId of segmentNodeIds(segment)) {
    if (!excludeNodeIds.has(nodeId)) nodeIds.add(nodeId);
  }
}

function doneAgentNodeIds(
  executionProgress: ExecutionProgressState | null,
  agentIdToNodeId: ReadonlyMap<string, string>,
): Set<string> {
  const done = new Set<string>();
  if (!executionProgress) return done;
  for (const agent of executionProgress.agents) {
    if (agent.status !== "done") continue;
    const nodeId = agentIdToNodeId.get(agent.agentId);
    if (nodeId) done.add(nodeId);
  }
  return done;
}

export function resolveRouteActiveVisual(
  highlight: RouteHighlightState,
  executionProgress: ExecutionProgressState | null,
  excludeNodeIds: ReadonlySet<string>,
  agentIdToNodeId: ReadonlyMap<string, string>,
): RouteActiveVisual {
  const empty: RouteActiveVisual = {
    activeNodeIds: new Set(),
    activeEdgeIds: new Set(),
    litNodeIds: new Set(),
    litEdgeIds: new Set(),
  };

  if (!highlight) return empty;

  const segments = highlight.animationSegments ?? [];
  const activeIndex = highlight.activeSegmentIndex ?? 0;
  const litIndices = new Set(highlight.litSegmentIndices ?? []);
  const doneAgents = doneAgentNodeIds(executionProgress, agentIdToNodeId);

  const litNodeIds = new Set<string>();
  const litEdgeIds = new Set<string>();
  for (const idx of litIndices) {
    const segment = segments[idx];
    if (!segment) continue;
    applySegmentToSets(segment, litNodeIds, litEdgeIds, excludeNodeIds);
  }

  const activeNodeIds = new Set<string>();
  const activeEdgeIds = new Set<string>();
  for (let i = 0; i <= activeIndex; i += 1) {
    if (litIndices.has(i)) continue;
    const segment = segments[i];
    if (!segment) continue;
    applySegmentToSets(segment, activeNodeIds, activeEdgeIds, excludeNodeIds);
  }

  for (const agentNodeId of doneAgents) {
    activeNodeIds.delete(agentNodeId);
    litNodeIds.add(agentNodeId);
  }

  const pendingAgentsOnRoute = [...activeNodeIds].some((nodeId) => nodeId.startsWith("assignment-"));
  const allAgentsDone =
    doneAgents.size > 0 &&
    ![...activeNodeIds].some((nodeId) => nodeId.startsWith("assignment-"));

  if (allAgentsDone || (doneAgents.size > 0 && !pendingAgentsOnRoute)) {
    for (const nodeId of activeNodeIds) {
      if (!nodeId.startsWith("assignment-")) litNodeIds.add(nodeId);
    }
    for (const edgeId of activeEdgeIds) litEdgeIds.add(edgeId);
    activeNodeIds.clear();
    activeEdgeIds.clear();
  }

  return {
    activeNodeIds,
    activeEdgeIds,
    litNodeIds,
    litEdgeIds,
  };
}
