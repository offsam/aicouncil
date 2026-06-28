import { computeAgentStatus } from "./agent-status";
import { AI_COUNCIL_OFFICE_ID } from "./ai-council-ids";
import {
  getFallbackSwitchCounts,
  listProviderHealth,
  type ProviderHealthStatus,
} from "./provider-failover-status";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import {
  TECH_DEPARTMENT_BUILDING_ID,
  TECH_DEPARTMENT_MONITORING_CHAMBER_ID,
} from "./workspace/tech-department";

export const MONITORED_PROVIDER_TAGS = ["gemini", "groq", "openrouter"] as const;

export type TechDepartmentStats = {
  deployedAgents: number;
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

type DeployedAgentRow = { id: string; provider: string; costTier: string | null };

function todayUtcIsoStart(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

async function loadDeployedAgents(): Promise<DeployedAgentRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_assignments")
    .select(
      "agent_id, agents!inner(id, provider, cost_tier), chambers!inner(id, building_object_id)",
    );

  if (error || !data) return [];

  const byAgentId = new Map<string, DeployedAgentRow>();

  for (const row of data) {
    const rawAgent = row.agents as
      | { id: string; provider: string; cost_tier: string | null }
      | { id: string; provider: string; cost_tier: string | null }[]
      | null;
    const rawChamber = row.chambers as
      | { id: string; building_object_id: string | null }
      | { id: string; building_object_id: string | null }[]
      | null;
    const agent = Array.isArray(rawAgent) ? rawAgent[0] : rawAgent;
    const chamber = Array.isArray(rawChamber) ? rawChamber[0] : rawChamber;
    if (!agent?.id || !chamber) continue;
    if (chamber.id === TECH_DEPARTMENT_MONITORING_CHAMBER_ID) continue;
    if (chamber.building_object_id === TECH_DEPARTMENT_BUILDING_ID) continue;
    if (!byAgentId.has(agent.id)) {
      byAgentId.set(agent.id, {
        id: agent.id,
        provider: agent.provider,
        costTier: agent.cost_tier,
      });
    }
  }

  return [...byAgentId.values()];
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
  const healthByTag = new Map(listProviderHealth().map((row) => [row.providerTag, row.status]));
  const deployed = await loadDeployedAgents();
  const deployedIds = new Set(deployed.map((a) => a.id));

  let availableAgents = 0;
  let onFallbackAgents = 0;
  let unavailableAgents = 0;
  let freeTierDeployed = 0;

  for (const agent of deployed) {
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

    const [agentsRes, connectionsRes, buildingsRes, chambersRes, routingRes] = await Promise.all([
      supabase.from("agents").select("id, provider"),
      supabase
        .from("connections")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("office_objects")
        .select("id", { count: "exact", head: true })
        .eq("office_id", AI_COUNCIL_OFFICE_ID)
        .eq("object_type", "room"),
      supabase.from("chambers").select("id", { count: "exact", head: true }),
      supabase
        .from("routing_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart),
    ]);

    const pool = agentsRes.data ?? [];
    totalAgentsInPool = pool.length;
    benchAgents = pool.filter((a) => !deployedIds.has(a.id)).length;
    agentsWithApiKey = pool.filter((a) => computeAgentStatus({ provider: a.provider }) === "online").length;
    activeConnections = connectionsRes.count ?? 0;
    buildingsCount = buildingsRes.count ?? 0;
    chambersCount = chambersRes.count ?? 0;
    routingDecisionsToday = routingRes.count ?? 0;
  }

  return {
    deployedAgents: deployed.length,
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
