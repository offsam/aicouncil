import type { Edge, Node } from "@xyflow/react";
import type { AgentAssignmentRow, ChamberRow } from "@/lib/office-types";
import {
  resolveInspectorTargetFromEdge,
  resolveInspectorTargetFromNode,
  type InspectorTarget,
} from "./inspector-target";

export type SelectionResolveContext = {
  officeId: string;
  chambers: ChamberRow[];
  assignments: AgentAssignmentRow[];
  nameByRegistryId: (registryId: string) => string;
};

/** Marquee / Cmd+A — chamber, agent, connection only (not city/building). */
export function isMarqueeSelectableNode(node: Node): boolean {
  return node.type === "chamber" || node.type === "agent";
}

export function isSingleSelectInspectorNode(node: Node): boolean {
  return node.type === "building";
}

export function enrichAgentTarget(
  node: Node,
  base: InspectorTarget,
  ctx: SelectionResolveContext,
): InspectorTarget {
  if (base.kind !== "agent") return base;
  const chamber = ctx.chambers.find((c) => c.id === base.chamberId);
  const assignment = ctx.assignments.find((a) => a.id === base.assignmentId);
  return {
    ...base,
    buildingId: chamber?.building_object_id || chamber?.building_entity_id || "",
    chamberRegistryId: node.parentId ?? base.chamberRegistryId,
    layoutX: assignment?.layout_x ?? null,
    layoutY: assignment?.layout_y ?? null,
  };
}

export function resolveTargetFromNode(
  node: Node,
  ctx: SelectionResolveContext,
): InspectorTarget | null {
  const base = resolveInspectorTargetFromNode(node, ctx.officeId);
  if (!base) return null;
  if (base.kind === "agent") return enrichAgentTarget(node, base, ctx);
  return base;
}

export function resolveTargetsFromGraphSelection(
  nodes: Node[],
  edges: Edge[],
  ctx: SelectionResolveContext,
): InspectorTarget[] {
  const out: InspectorTarget[] = [];

  for (const node of nodes) {
    if (!isMarqueeSelectableNode(node)) continue;
    const target = resolveTargetFromNode(node, ctx);
    if (target) out.push(target);
  }

  for (const edge of edges) {
    const target = resolveInspectorTargetFromEdge(edge, ctx.nameByRegistryId);
    if (target) out.push(target);
  }

  return out;
}

export function countDeletableTargets(targets: InspectorTarget[]): {
  agents: number;
  connections: number;
  total: number;
} {
  let agents = 0;
  let connections = 0;
  for (const t of targets) {
    if (t.kind === "agent") agents += 1;
    if (t.kind === "connection") connections += 1;
  }
  return { agents, connections, total: agents + connections };
}

export function groupTargetsByKind(
  targets: InspectorTarget[],
): Partial<Record<InspectorTarget["kind"], InspectorTarget[]>> {
  const groups: Partial<Record<InspectorTarget["kind"], InspectorTarget[]>> = {};
  for (const t of targets) {
    const list = groups[t.kind] ?? [];
    list.push(t);
    groups[t.kind] = list;
  }
  return groups;
}
