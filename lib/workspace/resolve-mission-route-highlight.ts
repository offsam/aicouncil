import type { ExecuteChatTaskResult } from "@/lib/execute-chat-task";
import type { WorkspacePendingRoute } from "@/lib/mission-workspace-bridge";
import type { AgentAssignmentRow, ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import {
  resolveRouteHighlight,
  type RouteHighlightResult,
} from "@/lib/workspace/resolve-route-highlight";

function toExecuteChatTaskResult(pending: WorkspacePendingRoute): ExecuteChatTaskResult {
  const successAgents = pending.agents.filter((a) => a.status === "success");
  const settledAgents = pending.agents.filter(
    (a) => a.status === "success" || a.status === "error",
  );

  const teamPayload =
    pending.agents.length > 1
      ? {
          partial:
            pending.phase === "running" ||
            successAgents.length < pending.agents.length,
          invokedCount: pending.agents.length,
          successCount: successAgents.length,
          summary: "",
          synthesis: null,
          agents: settledAgents.map((a) => ({
            agentId: a.agentDbId,
            slug: a.slug,
            agentName: a.agentName ?? a.slug,
            status: a.status === "success" ? ("success" as const) : ("error" as const),
            latencyMs: 0,
          })),
        }
      : undefined;

  return {
    mode: "single",
    executionMode: "fast",
    answer: "",
    routing: {
      targets: [
        {
          entityRegistryId: pending.routing.targetEntityRegistryId,
          confidence: 1,
          reason: pending.taskText.slice(0, 120),
        },
      ],
      method:
        pending.routing.method === "llm-expensive" ||
        pending.routing.method === "llm-cheap" ||
        pending.routing.method === "rule-based" ||
        pending.routing.method === "fallback" ||
        pending.routing.method === "fallback-blocked"
          ? pending.routing.method
          : "rule-based",
      agentCount: pending.agents.length,
      usedConnectionId: pending.routing.usedConnectionId,
      routeViaEntityId: pending.routing.routeViaEntityId,
    },
    targetName: pending.routing.targetName ?? null,
    agentName: successAgents[0]?.agentName ?? null,
    agentId: successAgents[0]?.agentDbId ?? null,
    team: teamPayload,
  };
}

export function resolveMissionRouteHighlight(
  pending: WorkspacePendingRoute,
  chambers: ChamberRow[],
  buildings: OfficeObjectRow[],
  assignments: AgentAssignmentRow[] = [],
): RouteHighlightResult | null {
  const targetChamber = chambers.find(
    (c) => c.entity_registry_id === pending.routing.targetEntityRegistryId,
  );
  const targetName = pending.routing.targetName ?? targetChamber?.name;

  const enriched: WorkspacePendingRoute = {
    ...pending,
    routing: { ...pending.routing, targetName },
  };

  return resolveRouteHighlight(
    toExecuteChatTaskResult(enriched),
    chambers,
    buildings,
    assignments,
  );
}
