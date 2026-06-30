import { computeAgentStatus } from "./agent-status";
import {
  getFallbackSwitchCounts,
  listProviderHealth,
  type ProviderHealthStatus,
} from "./provider-failover-status";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import {
  computeOfficeInventoryCounts,
  loadOfficeDeployedAgentRows,
} from "./office-inventory-counts";
import {
  requireExternalEntryOfficeId,
  requireTechDepartmentBuildingId,
} from "./workspace/graph-identity-required";

export const MONITORED_PROVIDER_TAGS = ["gemini", "groq", "openrouter"] as const;

export type TechDepartmentStats = {
  /** Unique agents on posts city-wide — same scope as Mayor agentsDeployedCount (MSA-1.3). */
  deployedAgents: number;
  /** Internal metric: deployed excluding Technical Department building chambers. */
  deployedAgentsExcludingTechDept: number;
  availableAgents: number;
  onFallbackAgents: number;
  unavailableAgents: number;
  benchAgents: number;
  totalAgentsInPool: number;
  freeTierDeployed: number;
  agentsWithApiKey: number;
  fallbackSwitchesSession: number;
  fallbackSwitchesToday: number;
  providersAvailable: number;
  providersOnFallback: number;
  providersUnavailable: number;
  providersIdle: number;
  activeConnections: number;
  buildingsCount: number;
  chambersCount: number;
  routingDecisionsToday: number;
  updatedAt: string;
};

/** Map agents.provider → in-memory failover provider tag. */
export function providerTagForAgent(provider: string | null | undefined): string | null {
  const p = (provider ?? "").trim().toLowerCase();
  if (p === "gemini" || p === "google") return "gemini";
  if (p === "groq") return "groq";
  if (p === "openrouter" || p.startsWith("or-")) return "openrouter";
  return null;
}

function classifyAgent(
  provider: string,
  healthStatus: ProviderHealthStatus | null,
): "available" | "on_fallback" | "unavailable" {
  const tag = providerTagForAgent(provider);
  if (tag && healthStatus) {
    if (healthStatus === "on_fallback") return "on_fallback";
    if (healthStatus === "unavailable") return "unavailable";
    return "available";
  }
  return computeAgentStatus({ provider }) === "online" ? "available" : "unavailable";
}

function todayUtcIsoStart(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function countProviderBuckets(healthByTag: Map<string, ProviderHealthStatus>): {
  providersAvailable: number;
  providersOnFallback: number;
  providersUnavailable: number;
  providersIdle: number;
} {
  let providersAvailable = 0;
  let providersOnFallback = 0;
  let providersUnavailable = 0;
  let providersIdle = 0;

  for (const tag of MONITORED_PROVIDER_TAGS) {
    const status = healthByTag.get(tag);
    if (!status) {
      providersIdle += 1;
      continue;
    }
    if (status === "available") providersAvailable += 1;
    else if (status === "on_fallback") providersOnFallback += 1;
    else providersUnavailable += 1;
  }

  return { providersAvailable, providersOnFallback, providersUnavailable, providersIdle };
}

export async function computeTechDepartmentStats(): Promise<TechDepartmentStats> {
  const officeId = await requireExternalEntryOfficeId();
  const techDepartmentBuildingId = await requireTechDepartmentBuildingId(officeId);
  const healthByTag = new Map(listProviderHealth().map((row) => [row.providerTag, row.status]));

  const [deployedRows, deployedExcludingTechRows, officeInventory] = await Promise.all([
    loadOfficeDeployedAgentRows(officeId),
    loadOfficeDeployedAgentRows(officeId, {
      excludeBuildingObjectIds: [techDepartmentBuildingId],
    }),
    computeOfficeInventoryCounts(officeId),
  ]);

  const deployedAgents = officeInventory.agentsDeployedCount;
  const deployedAgentsExcludingTechDept = deployedExcludingTechRows.length;
  const deployedIds = new Set(deployedRows.map((a) => a.id));

  let availableAgents = 0;
  let onFallbackAgents = 0;
  let unavailableAgents = 0;
  let freeTierDeployed = 0;

  for (const agent of deployedRows) {
    const tag = providerTagForAgent(agent.provider);
    const healthStatus = tag ? (healthByTag.get(tag) ?? null) : null;
    const bucket = classifyAgent(agent.provider, healthStatus);
    if (bucket === "available") availableAgents += 1;
    else if (bucket === "on_fallback") onFallbackAgents += 1;
    else unavailableAgents += 1;
    if ((agent.costTier ?? "").toLowerCase() === "free") freeTierDeployed += 1;
  }

  const switches = getFallbackSwitchCounts();
  const providerBuckets = countProviderBuckets(healthByTag);

  let totalAgentsInPool = 0;
  let benchAgents = 0;
  let agentsWithApiKey = 0;
  let activeConnections = 0;
  let buildingsCount = 0;
  let chambersCount = 0;
  let routingDecisionsToday = 0;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const todayStart = todayUtcIsoStart();
    const officeInventory = await computeOfficeInventoryCounts(officeId);

    const [agentsRes, routingRes] = await Promise.all([
      supabase.from("agents").select("id, provider"),
      supabase
        .from("routing_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart),
    ]);

    const pool = agentsRes.data ?? [];
    totalAgentsInPool = pool.length;
    benchAgents = pool.filter((a) => !deployedIds.has(a.id)).length;
    agentsWithApiKey = pool.filter((a) => computeAgentStatus({ provider: a.provider }) === "online").length;
    activeConnections = officeInventory.activeConnectionsCount;
    buildingsCount = officeInventory.buildingsCount;
    chambersCount = officeInventory.chambersCount;
    routingDecisionsToday = routingRes.count ?? 0;
  }

  return {
    deployedAgents,
    deployedAgentsExcludingTechDept,
    availableAgents,
    onFallbackAgents,
    unavailableAgents,
    benchAgents,
    totalAgentsInPool,
    freeTierDeployed,
    agentsWithApiKey,
    fallbackSwitchesSession: switches.session,
    fallbackSwitchesToday: switches.today,
    ...providerBuckets,
    activeConnections,
    buildingsCount,
    chambersCount,
    routingDecisionsToday,
    updatedAt: new Date().toISOString(),
  };
}
