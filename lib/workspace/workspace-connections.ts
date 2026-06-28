import type { Edge, Node } from "@xyflow/react";
import type { ConnectionPermissionRow, ConnectionRoutePath, ConnectionRow } from "@/lib/office-types";
import {
  assignConnectionHandleSlots,
  ensureNodeHandleSlot,
  mergeExtraConnectionHandles,
  normalizeConnectionHandleAssignment,
  type ConnectionHandleOverrides,
  type ConnectionHandleSlot,
} from "./connection-handle-slots";
import { assignConnectionLaneOffsets } from "./connection-route-path";
import { connectionEdgeStyle } from "./building-accent";

export type WorkspaceConnectionRow = ConnectionRow & {
  source?: { name: string; entity_type: string } | null;
  target?: { name: string; entity_type: string } | null;
};

export type ConnectionEntityType = "chamber" | "building" | "agent";

export type ConnectionEdgeData = {
  connectionId: string;
  permissions: ConnectionPermissionRow | null;
  sourceName: string;
  targetName: string;
  sourceType: ConnectionEntityType;
  targetType: ConnectionEntityType;
  laneOffset: number;
  routePath?: ConnectionRoutePath | null;
  accentColorId?: string | null;
  onRoutePathChange?: (connectionId: string, routePath: ConnectionRoutePath | null) => void;
  onDeleteConnection?: (connectionId: string) => Promise<void>;
  onOpenInspector?: () => void;
  onSelectEdge?: () => void;
  officeId?: string;
  highlighted?: boolean;
  dimmed?: boolean;
  routeFading?: boolean;
  hovered?: boolean;
  signalActive?: boolean;
  signalPulse?: boolean;
  signalDirection?: "forward" | "reverse";
  /** Yellow pulse while signal travels; green on successful return. */
  signalTone?: "active" | "success";
  /** Segments already lit green during return playback. */
  signalLit?: boolean;
};

export type WorkspaceConnectionRegistry = {
  chamberRegistryIds: Set<string>;
  buildingRegistryIds: Set<string>;
  agentRegistryIds: Set<string>;
  /** entity_registry agent id → React Flow node id */
  agentEntityToNodeId: Map<string, string>;
};

export function workspaceConnectionEdgeId(connectionId: string): string {
  return `connection-${connectionId}`;
}

export const DEFAULT_CONNECTION_PERMISSIONS = {
  read_knowledge: false,
  read_rules: false,
  read_results: false,
  send_tasks: false,
} as const;

/** Full access when a new cable is drawn; user can narrow in inspector. */
export const NEW_CONNECTION_PERMISSIONS = {
  read_knowledge: true,
  read_rules: true,
  read_results: true,
  send_tasks: true,
} as const;

export function formatPermissionLines(perms: ConnectionPermissionRow | null | undefined): string[] {
  const p = perms ?? {
    connection_id: "",
    ...DEFAULT_CONNECTION_PERMISSIONS,
  };
  return [
    `read_knowledge ${p.read_knowledge ? "✅" : "❌"}`,
    `read_rules ${p.read_rules ? "✅" : "❌"}`,
    `read_results ${p.read_results ? "✅" : "❌"}`,
    `send_tasks ${p.send_tasks ? "✅" : "❌"}`,
  ];
}

function normalizeEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveEndpointType(
  entityId: string,
  registry: WorkspaceConnectionRegistry,
  embedType?: string,
): ConnectionEntityType | null {
  if (embedType === "chamber" || embedType === "building" || embedType === "agent") {
    return embedType;
  }
  if (registry.chamberRegistryIds.has(entityId)) return "chamber";
  if (registry.buildingRegistryIds.has(entityId)) return "building";
  if (registry.agentRegistryIds.has(entityId)) return "agent";
  return null;
}

function entityRegistryIdToFlowNodeId(
  entityId: string,
  registry: WorkspaceConnectionRegistry,
): string | null {
  if (registry.chamberRegistryIds.has(entityId) || registry.buildingRegistryIds.has(entityId)) {
    return entityId;
  }
  return registry.agentEntityToNodeId.get(entityId) ?? null;
}

export type BuildConnectionEdgesResult = {
  edges: Edge[];
  nodeHandles: Map<string, ConnectionHandleSlot[]>;
};

/** Default stacking: cables render above buildings/chambers but below menus. */
export const CONNECTION_EDGE_Z_INDEX = 120;

export function buildConnectionEdges(
  connections: WorkspaceConnectionRow[],
  registry: WorkspaceConnectionRegistry,
  nodes: Node[] = [],
  handleOverrides?: ConnectionHandleOverrides,
  extraHandlesByNode?: Record<string, ConnectionHandleSlot[]>,
  connectionHandleAssignments?: Record<string, { sourceHandle: string; targetHandle: string }>,
): BuildConnectionEdgesResult {
  const edges: Edge[] = [];
  const active = connections.filter((c) => c.is_active);
  const laneOffsets = assignConnectionLaneOffsets(active);

  const nodeIdForEntity = (entityId: string) =>
    entityRegistryIdToFlowNodeId(entityId, registry);

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const { assignments } = assignConnectionHandleSlots(
    active,
    nodes,
    nodeIdForEntity,
    handleOverrides,
  );

  for (const conn of active) {
    const sourceType = resolveEndpointType(
      conn.source_entity_id,
      registry,
      normalizeEmbed(conn.source)?.entity_type,
    );
    const targetType = resolveEndpointType(
      conn.target_entity_id,
      registry,
      normalizeEmbed(conn.target)?.entity_type,
    );
    if (!sourceType || !targetType) continue;

    const sourceNodeId = entityRegistryIdToFlowNodeId(conn.source_entity_id, registry);
    const targetNodeId = entityRegistryIdToFlowNodeId(conn.target_entity_id, registry);
    if (!sourceNodeId || !targetNodeId) continue;

    const sourceNode = nodeById.get(sourceNodeId);
    const targetNode = nodeById.get(targetNodeId);
    if (!sourceNode || !targetNode) continue;

    // Nested chamber ↔ parent building links render as invisible in-shell jacks — require a real cable between nodes.
    if (sourceNode.parentId === targetNodeId || targetNode.parentId === sourceNodeId) {
      continue;
    }

    const source = normalizeEmbed(conn.source);
    const target = normalizeEmbed(conn.target);
    const perms = normalizeEmbed(
      conn.connection_permissions as ConnectionPermissionRow | ConnectionPermissionRow[] | null,
    );

    const handles = normalizeConnectionHandleAssignment(
      connectionHandleAssignments?.[conn.id] ??
        assignments.get(conn.id) ?? {
          sourceHandle: "source-right-0",
          targetHandle: "target-left-0",
        },
    );

    edges.push({
      id: workspaceConnectionEdgeId(conn.id),
      source: sourceNodeId,
      target: targetNodeId,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      type: "connection",
      zIndex: CONNECTION_EDGE_Z_INDEX,
      data: {
        connectionId: conn.id,
        permissions: perms,
        sourceName: source?.name ?? conn.source_entity_id.slice(0, 8),
        targetName: target?.name ?? conn.target_entity_id.slice(0, 8),
        sourceType,
        targetType,
        laneOffset: laneOffsets.get(conn.id) ?? 0,
        routePath: conn.route_path ?? null,
        accentColorId: conn.color ?? null,
        highlighted: false,
      } satisfies ConnectionEdgeData,
      style: connectionEdgeStyle(conn.color),
      interactionWidth: 24,
      selectable: true,
    });
  }

  // Only jack slots that have a rendered cable — never orphan ghost connectors.
  const renderedHandles = new Map<string, ConnectionHandleSlot[]>();
  for (const edge of edges) {
    if (!edge.source || !edge.target || !edge.sourceHandle || !edge.targetHandle) continue;
    ensureNodeHandleSlot(
      renderedHandles,
      edge.source,
      edge.sourceHandle,
      "source",
      nodeById.get(edge.source),
    );
    ensureNodeHandleSlot(
      renderedHandles,
      edge.target,
      edge.targetHandle,
      "target",
      nodeById.get(edge.target),
    );
  }

  for (const node of nodes) {
    const assigned = renderedHandles.get(node.id) ?? [];
    renderedHandles.set(
      node.id,
      mergeExtraConnectionHandles(
        assigned,
        extraHandlesByNode?.[node.id],
        node.id,
        handleOverrides,
        node,
      ),
    );
  }

  return { edges, nodeHandles: renderedHandles };
}

export function connectionRowToEdge(
  conn: WorkspaceConnectionRow,
  registry: WorkspaceConnectionRegistry,
  nodes: Node[] = [],
  connectionHandleAssignments?: Record<string, { sourceHandle: string; targetHandle: string }>,
): Edge | null {
  return buildConnectionEdges([conn], registry, nodes, undefined, undefined, connectionHandleAssignments)
    .edges[0] ?? null;
}

/** Handle ids that have an active cable attached — show jack chrome even when dormant. */
export function collectWiredHandleIds(edges: Edge[]): Map<string, string[]> {
  const acc = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.source && edge.sourceHandle) {
      const set = acc.get(edge.source) ?? new Set<string>();
      set.add(edge.sourceHandle);
      acc.set(edge.source, set);
    }
    if (edge.target && edge.targetHandle) {
      const set = acc.get(edge.target) ?? new Set<string>();
      set.add(edge.targetHandle);
      acc.set(edge.target, set);
    }
  }
  const out = new Map<string, string[]>();
  for (const [nodeId, set] of acc) out.set(nodeId, [...set]);
  return out;
}
