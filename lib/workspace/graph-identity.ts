import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  BuildingRole,
  GraphIdentityResult,
  MainChamberRef,
  TechCityHallConnectionRef,
} from "./graph-identity-types";
import { resolveMainChamber } from "./resolve-main-chamber";

function logGraphIdentityUnresolved(resolverName: string, reason: string): void {
  console.info(`[graph-identity] ${resolverName} unresolved=${reason}`);
}

function unresolvedResult<T>(value: T | null, reason: string): GraphIdentityResult<T> {
  return { value, source: "unresolved", unresolvedReason: reason };
}

function graphResult<T>(value: T | null): GraphIdentityResult<T> {
  return { value, source: "graph" };
}

function isMissingBuildingRoleColumn(error: { message?: string; code?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("building_role") &&
    (msg.includes("does not exist") || msg.includes("could not find") || error.code === "42703")
  );
}

function readExternalEntryFlag(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  return (meta as Record<string, unknown>).external_entry === true;
}

async function queryBuildingRegistryIdByRole(
  officeId: string,
  role: BuildingRole,
): Promise<{ id: string | null; graphAvailable: boolean }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("entity_registry")
    .select("id, building_role")
    .eq("parent_entity_id", officeId)
    .eq("building_role", role)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingBuildingRoleColumn(error)) {
      return { id: null, graphAvailable: false };
    }
    console.error(`[graph-identity] queryBuildingRegistryIdByRole(${role})`, error.message);
    return { id: null, graphAvailable: true };
  }

  return { id: data?.id ?? null, graphAvailable: true };
}

/**
 * DR-001: Headless-integration office (Telegram, etc.).
 * Graph: offices.workspace_meta.external_entry === true (exactly one office).
 * Observational only — use requireExternalEntryOfficeId() in production paths.
 */
export async function resolveExternalEntryOfficeId(): Promise<GraphIdentityResult<string>> {
  const supabase = getSupabaseAdmin();

  const { data: offices, error } = await supabase.from("offices").select("id, name, workspace_meta");
  if (error) {
    console.error("[graph-identity] resolveExternalEntryOfficeId", error.message);
    return unresolvedResult<string>(null, "offices_query_error");
  }

  const flagged = (offices ?? []).filter((row) => readExternalEntryFlag(row.workspace_meta));
  if (flagged.length === 1) {
    return graphResult(flagged[0]!.id);
  }
  if (flagged.length > 1) {
    logGraphIdentityUnresolved("resolveExternalEntryOfficeId", "multiple_external_entry");
    return unresolvedResult<string>(null, "multiple_external_entry");
  }

  logGraphIdentityUnresolved("resolveExternalEntryOfficeId", "none_external_entry");
  return unresolvedResult<string>(null, "none_external_entry");
}

/**
 * DR-002: City Hall building registry id under an office.
 * Graph: entity_registry.building_role = 'city_hall'
 * Observational only — use requireCityHallBuildingId() in production paths.
 */
export async function resolveCityHallBuildingId(
  officeId: string,
): Promise<GraphIdentityResult<string>> {
  const { id: graphId, graphAvailable } = await queryBuildingRegistryIdByRole(officeId, "city_hall");

  if (graphId) {
    return graphResult(graphId);
  }

  const reason = graphAvailable ? "building_role_unset" : "building_role_column_missing";
  logGraphIdentityUnresolved("resolveCityHallBuildingId", reason);
  return unresolvedResult<string>(null, reason);
}

/**
 * DR-003: Tech Department building registry id under an office.
 * Graph: entity_registry.building_role = 'tech_department'
 * Observational only — use requireTechDepartmentBuildingId() in production paths.
 */
export async function resolveTechDepartmentBuildingId(
  officeId: string,
): Promise<GraphIdentityResult<string>> {
  const { id: graphId, graphAvailable } = await queryBuildingRegistryIdByRole(
    officeId,
    "tech_department",
  );

  if (graphId) {
    return graphResult(graphId);
  }

  const reason = graphAvailable ? "building_role_unset" : "building_role_column_missing";
  logGraphIdentityUnresolved("resolveTechDepartmentBuildingId", reason);
  return unresolvedResult<string>(null, reason);
}

/** DR-004: Main manager chamber for a building registry id (graph field only). */
export async function resolveMainChamberForBuilding(
  buildingRegistryId: string,
): Promise<MainChamberRef | null> {
  const resolved = await resolveMainChamber(buildingRegistryId);
  if (!resolved) return null;
  return {
    chamberId: resolved.chamberId,
    chamberRegistryId: resolved.chamberRegistryId,
    managerAgentId: resolved.managerAgentId,
  };
}

/**
 * DR-006: Tech Department main chamber entity_registry id.
 * Graph: main chamber under tech_department building (routing_role = main).
 * Observational only — use requireTechDepartmentMainChamberRegistryId() in production paths.
 */
export async function resolveTechDepartmentMainChamberRegistryId(
  officeId: string,
): Promise<GraphIdentityResult<string>> {
  const building = await resolveTechDepartmentBuildingId(officeId);
  if (building.source !== "graph" || !building.value) {
    const reason = building.unresolvedReason ?? "building_role_unset";
    logGraphIdentityUnresolved("resolveTechDepartmentMainChamberRegistryId", reason);
    return unresolvedResult<string>(null, reason);
  }

  const main = await resolveMainChamberForBuilding(building.value);
  if (main?.chamberRegistryId) {
    return graphResult(main.chamberRegistryId);
  }

  logGraphIdentityUnresolved("resolveTechDepartmentMainChamberRegistryId", "main_chamber_missing");
  return unresolvedResult<string>(null, "main_chamber_missing");
}

/**
 * DR-005: Whether agent is the Mayor (City Hall main-chamber agent).
 * Graph: assigned/manager on main chamber under city_hall building.
 * Observational only — returns false when graph path cannot confirm Mayor.
 */
export async function isMayorAgent(
  agentId: string,
  officeId: string,
): Promise<GraphIdentityResult<boolean>> {
  const cityHall = await resolveCityHallBuildingId(officeId);
  if (cityHall.source !== "graph" || !cityHall.value) {
    const reason = cityHall.unresolvedReason ?? "building_role_unset";
    logGraphIdentityUnresolved("isMayorAgent", reason);
    return unresolvedResult(false, reason);
  }

  const main = await resolveMainChamberForBuilding(cityHall.value);
  if (!main?.chamberRegistryId) {
    logGraphIdentityUnresolved("isMayorAgent", "main_chamber_missing");
    return unresolvedResult(false, "main_chamber_missing");
  }

  if (main.managerAgentId === agentId) {
    return graphResult(true);
  }

  const supabase = getSupabaseAdmin();
  const { data: assignment } = await supabase
    .from("agent_assignments")
    .select("agent_id")
    .eq("chamber_id", main.chamberId)
    .eq("agent_id", agentId)
    .limit(1)
    .maybeSingle();

  if (assignment?.agent_id) {
    return graphResult(true);
  }

  return graphResult(false);
}

function mapConnectionRow(conn: {
  id: string;
  target_entity_id: string;
  connection_permissions: unknown;
}): TechCityHallConnectionRef {
  const perms = conn.connection_permissions as
    | { send_tasks?: boolean; read_results?: boolean }
    | { send_tasks?: boolean; read_results?: boolean }[]
    | null;
  const perm = Array.isArray(perms) ? perms[0] : perms;
  return {
    connectionId: conn.id,
    targetEntityId: conn.target_entity_id,
    sendTasks: perm?.send_tasks === true,
    readResults: perm?.read_results === true,
  };
}

/**
 * DR-007: Mandatory Tech Department → City Hall escalation edge (Model 1).
 * Graph: active connection between graph-resolved building ids.
 * Observational only — missing connection returns null (escalation no-op by design).
 */
export async function findTechDepartmentCityHallConnection(
  officeId: string,
): Promise<GraphIdentityResult<TechCityHallConnectionRef>> {
  const supabase = getSupabaseAdmin();
  const techBuilding = await resolveTechDepartmentBuildingId(officeId);
  const cityHallBuilding = await resolveCityHallBuildingId(officeId);

  if (
    techBuilding.source !== "graph" ||
    !techBuilding.value ||
    cityHallBuilding.source !== "graph" ||
    !cityHallBuilding.value
  ) {
    logGraphIdentityUnresolved("findTechDepartmentCityHallConnection", "building_role_unset");
    return unresolvedResult<TechCityHallConnectionRef>(null, "building_role_unset");
  }

  const { data: conn } = await supabase
    .from("connections")
    .select(
      "id, target_entity_id, is_active, connection_permissions(send_tasks, read_results)",
    )
    .eq("source_entity_id", techBuilding.value)
    .eq("target_entity_id", cityHallBuilding.value)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (conn?.id) {
    return graphResult(mapConnectionRow(conn));
  }

  logGraphIdentityUnresolved("findTechDepartmentCityHallConnection", "connection_missing");
  return unresolvedResult<TechCityHallConnectionRef>(null, "connection_missing");
}
