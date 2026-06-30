import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import { TECH_DEPARTMENT_MONITORING_CHAMBER_ID } from "./workspace/tech-department";

/** Office-scoped structural inventory — reusable by Tech Department stats and Mayor snapshot. */
export type OfficeInventoryCounts = {
  officeId: string;
  buildingsCount: number;
  chambersCount: number;
  /** Unique agents assigned to chambers in this office (excludes monitoring chamber). */
  agentsDeployedCount: number;
  /** All agents in the workspace pool (agents table, global). */
  agentsPoolCount: number;
  activeConnectionsCount: number;
  updatedAt: string;
};

export type OfficeDeployedAgentRow = {
  id: string;
  provider: string;
  costTier: string | null;
};

export type OfficeChamberScopeOptions = {
  /** Exclude chambers in these building_object ids (e.g. Tech Department building). */
  excludeBuildingObjectIds?: string[];
};

async function loadOfficeBuildingObjectIds(officeId: string): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("office_objects")
    .select("id")
    .eq("office_id", officeId)
    .eq("object_type", "room");

  if (error || !data) return [];
  return data.map((row) => row.id).filter(Boolean);
}

async function loadOfficeEntityRegistryIds(
  officeId: string,
  buildingObjectIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>([officeId, ...buildingObjectIds]);
  if (!isSupabaseConfigured() || buildingObjectIds.length === 0) return ids;

  const supabase = getSupabaseAdmin();
  const { data: chambers } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("entity_type", "chamber")
    .in("parent_entity_id", buildingObjectIds);

  const chamberRegistryIds = (chambers ?? []).map((row) => row.id).filter(Boolean);
  for (const id of chamberRegistryIds) ids.add(id);

  if (chamberRegistryIds.length === 0) return ids;

  const { data: agents } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("entity_type", "agent")
    .in("parent_entity_id", chamberRegistryIds);

  for (const row of agents ?? []) {
    if (row.id) ids.add(row.id);
  }

  return ids;
}

/** Chamber table ids in office buildings (minus monitoring chamber). */
export async function loadOfficeChamberTableIds(
  officeId: string,
  options?: OfficeChamberScopeOptions,
): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const buildingObjectIds = await loadOfficeBuildingObjectIds(officeId);
  const exclude = new Set(options?.excludeBuildingObjectIds ?? []);
  const scopedBuildings = buildingObjectIds.filter((id) => !exclude.has(id));
  if (scopedBuildings.length === 0) return [];

  const supabase = getSupabaseAdmin();
  const { data: officeChambers, error } = await supabase
    .from("chambers")
    .select("id")
    .in("building_object_id", scopedBuildings);

  if (error || !officeChambers?.length) return [];
  return officeChambers
    .map((row) => row.id)
    .filter((id): id is string => Boolean(id && id !== TECH_DEPARTMENT_MONITORING_CHAMBER_ID));
}

/** Unique deployed agents in office chambers — same scope as agentsDeployedCount when no excludes. */
export async function loadOfficeDeployedAgentRows(
  officeId: string,
  options?: OfficeChamberScopeOptions,
): Promise<OfficeDeployedAgentRow[]> {
  if (!isSupabaseConfigured()) return [];

  const chamberTableIds = await loadOfficeChamberTableIds(officeId, options);
  if (chamberTableIds.length === 0) return [];

  const supabase = getSupabaseAdmin();
  const { data: assignments, error: assignError } = await supabase
    .from("agent_assignments")
    .select("agent_id, agents!inner(id, provider, cost_tier)")
    .in("chamber_id", chamberTableIds);

  if (assignError || !assignments) return [];

  const byAgentId = new Map<string, OfficeDeployedAgentRow>();
  for (const row of assignments) {
    const rawAgent = row.agents as
      | { id: string; provider: string; cost_tier: string | null }
      | { id: string; provider: string; cost_tier: string | null }[]
      | null;
    const agent = Array.isArray(rawAgent) ? rawAgent[0] : rawAgent;
    if (!agent?.id || byAgentId.has(agent.id)) continue;
    byAgentId.set(agent.id, {
      id: agent.id,
      provider: agent.provider,
      costTier: agent.cost_tier,
    });
  }

  return [...byAgentId.values()];
}

export async function computeOfficeInventoryCounts(
  officeId: string,
): Promise<OfficeInventoryCounts> {
  const empty: OfficeInventoryCounts = {
    officeId,
    buildingsCount: 0,
    chambersCount: 0,
    agentsDeployedCount: 0,
    agentsPoolCount: 0,
    activeConnectionsCount: 0,
    updatedAt: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) return empty;

  const supabase = getSupabaseAdmin();
  const buildingObjectIds = await loadOfficeBuildingObjectIds(officeId);
  const buildingsCount = buildingObjectIds.length;

  let chambersCount = 0;
  let agentsDeployedCount = 0;
  if (buildingObjectIds.length > 0) {
    const { count: chamberCount, error: chamberError } = await supabase
      .from("chambers")
      .select("id", { count: "exact", head: true })
      .in("building_object_id", buildingObjectIds);

    if (!chamberError) chambersCount = chamberCount ?? 0;

    const deployedRows = await loadOfficeDeployedAgentRows(officeId);
    agentsDeployedCount = deployedRows.length;
  }

  const officeEntityIds = await loadOfficeEntityRegistryIds(officeId, buildingObjectIds);

  const [{ count: poolCount }, { data: connections }] = await Promise.all([
    supabase.from("agents").select("id", { count: "exact", head: true }),
    supabase
      .from("connections")
      .select("source_entity_id, target_entity_id")
      .eq("is_active", true),
  ]);

  const activeConnectionsCount = (connections ?? []).filter(
    (row) =>
      officeEntityIds.has(row.source_entity_id) &&
      officeEntityIds.has(row.target_entity_id),
  ).length;

  return {
    officeId,
    buildingsCount,
    chambersCount,
    agentsDeployedCount,
    agentsPoolCount: poolCount ?? 0,
    activeConnectionsCount,
    updatedAt: new Date().toISOString(),
  };
}
