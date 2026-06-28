import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";
import type { ConnectionPermissionRow, RuleRow } from "@/lib/office-types";
import type { WorkspaceConnectionRow } from "./workspace-connections";
import type { InspectorTarget } from "./inspector-target";

export type KnowledgeEntry = {
  id: string;
  title: string;
  content: string | null;
  body?: string | null;
  file_url: string | null;
  entity_type: string;
  entity_id: string;
  created_at?: string;
};

export type AssignmentEntry = {
  id: string;
  agent_id: string;
  chamber_id: string;
  role: string | null;
  layout_x: number | null;
  layout_y: number | null;
  layout_size: number | null;
  agents?: {
    id: string;
    name: string;
    provider: string;
    model_id: string;
    cost_tier?: string;
  } | null;
};

export type KnowledgeSourceGroup = {
  source: "city" | "building" | "chamber";
  label: string;
  entries: KnowledgeEntry[];
};

export type InspectorConnectionSummary = {
  id: string;
  direction: "outgoing" | "incoming";
  peerName: string;
  peerRegistryId: string;
  sendTasks: boolean;
  readKnowledge: boolean;
};

export type RequestLogEntry = {
  id: string;
  agent_id?: string | null;
  agent_name?: string | null;
  question: string;
  response: string | null;
  status: string;
  latency_ms: number | null;
  created_at: string;
};

export type ArchiveRow = {
  id: string;
  entity_registry_id: string;
  type: "raw" | "summary";
  content: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  archived_into: string | null;
};

export type ArchiveGroup = {
  chamberId: string;
  name: string;
  registryId: string;
  rows: ArchiveRow[];
};

export type InspectorEntityStats = {
  requestCount: number;
  successCount: number;
  errorCount: number;
  pendingCount: number;
  estimatedTokens: number;
};

export type InspectorAgentInScope = {
  id: string;
  name: string;
  provider: string | null;
  model_id: string | null;
  cost_tier: string | null;
};

export type InspectorChamberInScope = {
  chamberId: string;
  name: string;
  registryId: string;
  agentCount: number;
  requestCount?: number;
  estimatedTokens?: number;
};

export type InspectorAgentStatRow = {
  agentId: string;
  name: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  pendingCount: number;
  estimatedTokens: number;
};

export type InspectorLoadedData = {
  rules: RuleRow[];
  knowledgeSources: KnowledgeSourceGroup[];
  localKnowledge: KnowledgeEntry[];
  assignments: AssignmentEntry[];
  /** agents.id of chamber lead (chambers.manager_agent_id) */
  managerAgentId?: string | null;
  connections: InspectorConnectionSummary[];
  routingDescription: string | null;
  routingDescriptionEditable: boolean;
  officeRulesText: string | null;
  metadata: Record<string, string | number | null>;
  entityStats?: InspectorEntityStats | null;
  recentLogs?: RequestLogEntry[];
  archiveGroups?: ArchiveGroup[];
  agentsInScope?: InspectorAgentInScope[];
  agentStats?: InspectorAgentStatRow[];
  chambersInScope?: InspectorChamberInScope[];
  agentDetail?: {
    id: string;
    name: string;
    provider: string;
    model_id: string;
    status: string;
    cost_tier: string | null;
    color?: string | null;
    created_at: string;
  } | null;
  connectionDetail?: {
    id: string;
    priority: number;
    is_active: boolean;
    permissions: ConnectionPermissionRow;
    sourceLabel: string;
    targetLabel: string;
    sourceRegistryId: string;
    targetRegistryId: string;
    created_at: string;
  };
};

async function fetchRules(entityType: string, entityId: string): Promise<RuleRow[]> {
  const res = await fetch(
    `/api/rules?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`,
  );
  const data = (await res.json()) as { rules?: RuleRow[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? "rules fetch failed");
  return data.rules ?? [];
}

async function fetchKnowledge(entityType: string, entityId: string): Promise<KnowledgeEntry[]> {
  const res = await fetch(
    `/api/knowledge?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`,
  );
  const data = (await res.json()) as { entries?: KnowledgeEntry[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? "knowledge fetch failed");
  return data.entries ?? [];
}

async function fetchAssignments(chamberId: string): Promise<{
  assignments: AssignmentEntry[];
  managerAgentId: string | null;
}> {
  const res = await fetch(`/api/chambers/${chamberId}/assignments`);
  const data = (await res.json()) as {
    assignments?: AssignmentEntry[];
    manager_agent_id?: string | null;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? "assignments fetch failed");
  return {
    assignments: data.assignments ?? [],
    managerAgentId: data.manager_agent_id ?? null,
  };
}

function summarizeConnections(
  registryId: string,
  all: WorkspaceConnectionRow[],
  nameById: (id: string) => string,
): InspectorConnectionSummary[] {
  const out: InspectorConnectionSummary[] = [];
  for (const c of all) {
    if (!c.is_active) continue;
    const perms = Array.isArray(c.connection_permissions)
      ? c.connection_permissions[0]
      : c.connection_permissions;
    if (c.source_entity_id === registryId) {
      out.push({
        id: c.id,
        direction: "outgoing",
        peerName: nameById(c.target_entity_id),
        peerRegistryId: c.target_entity_id,
        sendTasks: perms?.send_tasks ?? false,
        readKnowledge: perms?.read_knowledge ?? false,
      });
    } else if (c.target_entity_id === registryId) {
      out.push({
        id: c.id,
        direction: "incoming",
        peerName: nameById(c.source_entity_id),
        peerRegistryId: c.source_entity_id,
        sendTasks: perms?.send_tasks ?? false,
        readKnowledge: perms?.read_knowledge ?? false,
      });
    }
  }
  return out;
}

function routingFromRegistry(
  registry: { routing_description?: string | null } | null | undefined,
): string | null {
  const t = registry?.routing_description?.trim();
  return t || null;
}

export type AgentPopoverData = {
  entityStats: InspectorEntityStats | null;
  agentDetail: InspectorLoadedData["agentDetail"];
  recentLogs: RequestLogEntry[];
};

export type ConnectionPopoverData = {
  entityStats: InspectorEntityStats | null;
  connectionDetail?: InspectorLoadedData["connectionDetail"];
  activeDurationMs: number | null;
  statsNote: string | null;
};

export async function fetchConnectionPopoverData(
  officeId: string,
  connectionId: string,
): Promise<ConnectionPopoverData> {
  const params = new URLSearchParams({
    officeId,
    scope: "connection",
    connectionId,
    limit: "5",
  });

  const res = await fetch(`/api/workspace/entity-stats?${params.toString()}`);
  const body = (await res.json()) as {
    stats?: InspectorEntityStats;
    connection?: InspectorLoadedData["connectionDetail"];
    activeDurationMs?: number;
    statsNote?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? "connection stats fetch failed");
  }

  return {
    entityStats: body.stats ?? null,
    connectionDetail: body.connection ?? undefined,
    activeDurationMs: body.activeDurationMs ?? null,
    statsNote: body.statsNote ?? null,
  };
}

export async function fetchAgentPopoverData(
  officeId: string,
  agentId: string,
  logLimit = 5,
): Promise<AgentPopoverData> {
  const params = new URLSearchParams({
    officeId,
    scope: "agent",
    agentId,
    limit: String(logLimit),
  });

  const res = await fetch(`/api/workspace/entity-stats?${params.toString()}`);
  const body = (await res.json()) as {
    stats?: InspectorEntityStats;
    recentLogs?: RequestLogEntry[];
    archiveGroups?: ArchiveGroup[];
    agent?: InspectorLoadedData["agentDetail"];
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? "entity stats fetch failed");
  }

  return {
    entityStats: body.stats ?? null,
    agentDetail: body.agent ?? null,
    recentLogs: body.recentLogs ?? [],
  };
}

async function fetchEntityStats(
  target: InspectorTarget,
  logLimit: number,
): Promise<{
  entityStats: InspectorEntityStats | null;
  recentLogs: RequestLogEntry[];
  archiveGroups: ArchiveGroup[];
  agentsInScope: InspectorAgentInScope[];
  agentStats: InspectorAgentStatRow[];
  chambersInScope: InspectorChamberInScope[];
  agentDetail: InspectorLoadedData["agentDetail"];
}> {
  const empty = {
    entityStats: null,
    recentLogs: [] as RequestLogEntry[],
    archiveGroups: [] as ArchiveGroup[],
    agentsInScope: [] as InspectorAgentInScope[],
    agentStats: [] as InspectorAgentStatRow[],
    chambersInScope: [] as InspectorChamberInScope[],
    agentDetail: null,
  };

  if (target.kind !== "agent" && target.kind !== "chamber" && target.kind !== "building") {
    return empty;
  }

  const params = new URLSearchParams({
    officeId: target.officeId,
    limit: String(logLimit),
  });

  if (target.kind === "agent") {
    params.set("scope", "agent");
    params.set("agentId", target.agentId);
  } else if (target.kind === "chamber") {
    params.set("scope", "chamber");
    params.set("chamberId", target.chamberId);
  } else {
    params.set("scope", "building");
    params.set("buildingId", target.buildingId);
  }

  const res = await fetch(`/api/workspace/entity-stats?${params.toString()}`);
  const body = (await res.json()) as {
    stats?: InspectorEntityStats;
    recentLogs?: RequestLogEntry[];
    archiveGroups?: ArchiveGroup[];
    agentsInScope?: InspectorAgentInScope[];
    agentStats?: InspectorAgentStatRow[];
    chambersInScope?: InspectorChamberInScope[];
    agent?: InspectorLoadedData["agentDetail"];
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? "entity stats fetch failed");
  }

  return {
    entityStats: body.stats ?? null,
    recentLogs: body.recentLogs ?? [],
    archiveGroups: body.archiveGroups ?? [],
    agentsInScope: body.agentsInScope ?? [],
    agentStats: body.agentStats ?? [],
    chambersInScope: body.chambersInScope ?? [],
    agentDetail: body.agent ?? null,
  };
}

function withEntityStats(
  base: Omit<
    InspectorLoadedData,
    | "entityStats"
    | "recentLogs"
    | "archiveGroups"
    | "agentsInScope"
    | "agentStats"
    | "chambersInScope"
    | "agentDetail"
  >,
  statsBundle: Awaited<ReturnType<typeof fetchEntityStats>>,
): InspectorLoadedData {
  return {
    ...base,
    entityStats: statsBundle.entityStats,
    recentLogs: statsBundle.recentLogs,
    archiveGroups: statsBundle.archiveGroups,
    agentsInScope: statsBundle.agentsInScope,
    agentStats: statsBundle.agentStats,
    chambersInScope: statsBundle.chambersInScope,
    agentDetail: statsBundle.agentDetail,
  };
}

async function fetchBuildingRoutingRegistry(officeId: string, buildingId: string) {
  const res = await fetch(`/api/offices/${officeId}/objects/${buildingId}`);
  const body = (await res.json()) as { routingDescription?: string | null; error?: string };
  if (!res.ok) throw new Error(body.error ?? "building routing fetch failed");
  return { routing_description: body.routingDescription ?? null };
}

async function fetchChamberRoutingRegistry(registryId: string) {
  const res = await fetch(
    `/api/workspace/entity-routing?registryId=${encodeURIComponent(registryId)}`,
  );
  const body = (await res.json()) as { routingDescription?: string | null; error?: string };
  if (!res.ok) throw new Error(body.error ?? "chamber routing fetch failed");
  return { routing_description: body.routingDescription ?? null };
}

export async function loadInspectorData(
  target: InspectorTarget,
  ctx: {
    connections: WorkspaceConnectionRow[];
    nameByRegistryId: (id: string) => string;
    chamberRegistry?: { routing_description?: string | null } | null;
    buildingRegistry?: { routing_description?: string | null } | null;
    cityRegistry?: { routing_description?: string | null } | null;
    logLimit?: number;
    lightweight?: boolean;
  },
): Promise<InspectorLoadedData> {
  const { connections, nameByRegistryId, lightweight = false } = ctx;

  if (target.kind === "connection") {
    const row = connections.find((c) => c.id === target.connectionId);
    const permsRaw = row?.connection_permissions;
    const perms = Array.isArray(permsRaw) ? permsRaw[0] : permsRaw;
    const permissions: ConnectionPermissionRow = perms ?? {
      connection_id: target.connectionId,
      read_knowledge: false,
      read_rules: false,
      read_results: false,
      send_tasks: false,
    };

    let entityStats: InspectorEntityStats | null = null;
    try {
      const popover = await fetchConnectionPopoverData(
        AI_COUNCIL_OFFICE_ID,
        target.connectionId,
      );
      entityStats = popover.entityStats;
    } catch {
      entityStats = null;
    }

    return {
      rules: [],
      knowledgeSources: [],
      localKnowledge: [],
      assignments: [],
      connections: [],
      routingDescription: null,
      routingDescriptionEditable: false,
      officeRulesText: null,
      entityStats,
      recentLogs: [],
      metadata: {
        connection_id: target.connectionId,
        created_at: row?.created_at ?? null,
        priority: row?.priority ?? 0,
        is_active: row?.is_active ? 1 : 0,
      },
      connectionDetail: {
        id: target.connectionId,
        priority: row?.priority ?? 0,
        is_active: row?.is_active ?? true,
        permissions,
        sourceLabel: target.sourceLabel,
        targetLabel: target.targetLabel,
        sourceRegistryId: target.sourceRegistryId,
        targetRegistryId: target.targetRegistryId,
        created_at: row?.created_at ?? "",
      },
    };
  }

  if (target.kind === "city") {
    const officeRes = await fetch(`/api/offices/${target.officeId}`);
    const officeData = (await officeRes.json()) as {
      office?: { rules?: string; created_at?: string; workspace_meta?: unknown };
      error?: string;
    };
    if (!officeRes.ok) throw new Error(officeData.error ?? "office fetch failed");

    const [rules, cityKnowledge] = await Promise.all([
      fetchRules("city", target.officeId),
      fetchKnowledge("city", target.officeId),
    ]);

    const meta = officeData.office?.workspace_meta;
    const cityHall =
      meta && typeof meta === "object" && "city_hall" in meta
        ? JSON.stringify((meta as { city_hall?: unknown }).city_hall)
        : null;

    return {
      rules,
      knowledgeSources: [
        {
          source: "city",
          label: "Local City Knowledge",
          entries: cityKnowledge,
        },
      ],
      localKnowledge: cityKnowledge,
      assignments: [],
      connections: summarizeConnections(target.officeId, connections, nameByRegistryId),
      routingDescription: routingFromRegistry(ctx.cityRegistry),
      routingDescriptionEditable: false,
      officeRulesText: officeData.office?.rules ?? null,
      metadata: {
        office_id: target.officeId,
        created_at: officeData.office?.created_at ?? null,
        workspace_meta_city_hall: cityHall,
      },
    };
  }

  if (target.kind === "building") {
    const buildingRegistry =
      ctx.buildingRegistry ??
      (await fetchBuildingRoutingRegistry(target.officeId, target.buildingId));

    if (lightweight) {
      const statsBundle = await fetchEntityStats(target, ctx.logLimit ?? 5);
      return withEntityStats(
        {
          rules: [],
          knowledgeSources: [],
          localKnowledge: [],
          assignments: [],
          connections: summarizeConnections(target.buildingId, connections, nameByRegistryId),
          routingDescription: routingFromRegistry(buildingRegistry),
          routingDescriptionEditable: true,
          officeRulesText: null,
          metadata: { building_id: target.buildingId },
        },
        statsBundle,
      );
    }

    const [rules, buildingKnowledge, cityKnowledge, statsBundle] = await Promise.all([
      fetchRules("building", target.buildingId),
      fetchKnowledge("building", target.buildingId),
      fetchKnowledge("city", target.officeId),
      fetchEntityStats(target, ctx.logLimit ?? 20),
    ]);

    return withEntityStats(
      {
        rules,
        knowledgeSources: [
          { source: "city", label: "Inherited from City", entries: cityKnowledge },
          { source: "building", label: "Local Building Knowledge", entries: buildingKnowledge },
        ],
        localKnowledge: buildingKnowledge,
        assignments: [],
        connections: summarizeConnections(target.buildingId, connections, nameByRegistryId),
        routingDescription: routingFromRegistry(buildingRegistry),
        routingDescriptionEditable: true,
        officeRulesText: null,
        metadata: {
          building_id: target.buildingId,
        },
      },
      statsBundle,
    );
  }

  if (target.kind === "chamber") {
    let chamberRegistry = ctx.chamberRegistry ?? null;
    if (!chamberRegistry) {
      try {
        chamberRegistry = await fetchChamberRoutingRegistry(target.registryId);
      } catch {
        chamberRegistry = null;
      }
    }

    if (lightweight) {
      const [rules, chamberKnowledge, statsBundle] = await Promise.all([
        fetchRules("chamber", target.registryId),
        fetchKnowledge("chamber", target.registryId),
        fetchEntityStats(target, ctx.logLimit ?? 5),
      ]);
      return withEntityStats(
        {
          rules,
          knowledgeSources: [
            {
              source: "chamber",
              label: "Local Chamber Knowledge",
              entries: chamberKnowledge,
            },
          ],
          localKnowledge: chamberKnowledge,
          assignments: [],
          connections: summarizeConnections(target.registryId, connections, nameByRegistryId),
          routingDescription: routingFromRegistry(chamberRegistry),
          routingDescriptionEditable: true,
          officeRulesText: null,
          metadata: {
            chamber_id: target.chamberId,
            registry_id: target.registryId,
            building_id: target.buildingId,
          },
        },
        statsBundle,
      );
    }

    const [rules, chamberKnowledge, buildingKnowledge, cityKnowledge, assignmentBundle, statsBundle] =
      await Promise.all([
        fetchRules("chamber", target.registryId),
        fetchKnowledge("chamber", target.registryId),
        fetchKnowledge("building", target.buildingId),
        fetchKnowledge("city", target.officeId),
        fetchAssignments(target.chamberId),
        fetchEntityStats(target, ctx.logLimit ?? 20),
      ]);

    return withEntityStats(
      {
        rules,
        knowledgeSources: [
          { source: "city", label: "Inherited from City", entries: cityKnowledge },
          { source: "building", label: "Inherited from Building", entries: buildingKnowledge },
          { source: "chamber", label: "Local Chamber Knowledge", entries: chamberKnowledge },
        ],
        localKnowledge: chamberKnowledge,
        assignments: assignmentBundle.assignments,
        managerAgentId: assignmentBundle.managerAgentId,
        connections: summarizeConnections(target.registryId, connections, nameByRegistryId),
        routingDescription: routingFromRegistry(chamberRegistry),
        routingDescriptionEditable: true,
        officeRulesText: null,
        metadata: {
          chamber_id: target.chamberId,
          registry_id: target.registryId,
          building_id: target.buildingId,
        },
      },
      statsBundle,
    );
  }

  // agent
  if (lightweight) {
    const statsBundle = await fetchEntityStats(target, ctx.logLimit ?? 5);
    return withEntityStats(
      {
        rules: [],
        knowledgeSources: [],
        localKnowledge: [],
        assignments: [],
        connections: summarizeConnections(target.agentId, connections, nameByRegistryId),
        routingDescription: null,
        routingDescriptionEditable: false,
        officeRulesText: null,
        metadata: {
          assignment_id: target.assignmentId,
          agent_id: target.agentId,
          chamber_id: target.chamberId,
          chamber_registry_id: target.chamberRegistryId,
          provider: target.provider,
          model_id: target.modelId,
          cost_tier: target.costTier,
          layout_x: target.layoutX,
          layout_y: target.layoutY,
          role: null,
        },
      },
      statsBundle,
    );
  }

  const [assignmentBundle, statsBundle] = await Promise.all([
    fetchAssignments(target.chamberId),
    fetchEntityStats(target, ctx.logLimit ?? 20),
  ]);
  const assignments = assignmentBundle.assignments;
  const assignment = assignments.find((a) => a.id === target.assignmentId);

  return withEntityStats(
    {
      rules: [],
      knowledgeSources: [],
      localKnowledge: [],
      assignments,
      managerAgentId: assignmentBundle.managerAgentId,
      connections: summarizeConnections(target.agentId, connections, nameByRegistryId),
      routingDescription: null,
      routingDescriptionEditable: false,
      officeRulesText: null,
      metadata: {
        assignment_id: target.assignmentId,
        agent_id: target.agentId,
        chamber_id: target.chamberId,
        chamber_registry_id: target.chamberRegistryId,
        provider: target.provider,
        model_id: target.modelId,
        cost_tier: target.costTier,
        layout_x: assignment?.layout_x ?? target.layoutX,
        layout_y: assignment?.layout_y ?? target.layoutY,
        role: assignment?.role ?? null,
      },
    },
    statsBundle,
  );
}
