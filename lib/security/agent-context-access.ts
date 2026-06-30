import { getSupabaseAdmin } from "../supabase/admin";
import { resolveMainChamber } from "../workspace/resolve-main-chamber";

/** Generic public message — same for missing ids and unauthorized access (X-01B). */
export const CONTEXT_ACCESS_DENIED_PUBLIC_MESSAGE =
  "Доступ к контексту этой сущности запрещён.";

export class ContextAccessDeniedError extends Error {
  readonly userMessage = CONTEXT_ACCESS_DENIED_PUBLIC_MESSAGE;
  readonly httpStatus = 403;

  constructor(internalReason: string) {
    super(internalReason);
    this.name = "ContextAccessDeniedError";
  }
}

export function isContextAccessDeniedError(err: unknown): err is ContextAccessDeniedError {
  return err instanceof ContextAccessDeniedError;
}

export type AgentContextAccessParams = {
  officeId: string;
  agentId: string;
  /** When set, agent must be assigned to this chamber registry id within the office. */
  chamberRegistryId?: string;
};

type ResolvedChamberInOffice = {
  chamberTableId: string;
  chamberRegistryId: string;
};

async function loadOfficeBuildingObjectIds(officeId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("office_objects")
    .select("id")
    .eq("office_id", officeId)
    .eq("object_type", "room");
  return (data ?? []).map((row) => row.id).filter(Boolean);
}

async function isAgentInOffice(agentId: string, officeId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data: agent } = await supabase
    .from("agents")
    .select("id, office_id")
    .eq("id", agentId)
    .maybeSingle();

  if (!agent) return false;
  if (agent.office_id === officeId) return true;

  const buildingIds = await loadOfficeBuildingObjectIds(officeId);
  if (buildingIds.length === 0) return false;

  const { data: chambers } = await supabase
    .from("chambers")
    .select("id")
    .in("building_object_id", buildingIds);
  const chamberTableIds = (chambers ?? []).map((row) => row.id).filter(Boolean);
  if (chamberTableIds.length === 0) return false;

  const { count } = await supabase
    .from("agent_assignments")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .in("chamber_id", chamberTableIds);

  return (count ?? 0) > 0;
}

async function resolveChamberInOffice(
  chamberRegistryId: string,
  officeId: string,
): Promise<ResolvedChamberInOffice | null> {
  const supabase = getSupabaseAdmin();
  const buildingIds = await loadOfficeBuildingObjectIds(officeId);
  if (buildingIds.length === 0) return null;

  const { data: directChamber } = await supabase
    .from("chambers")
    .select("id, entity_registry_id, building_object_id")
    .eq("entity_registry_id", chamberRegistryId)
    .maybeSingle();

  if (directChamber?.id && directChamber.entity_registry_id) {
    if (!buildingIds.includes(directChamber.building_object_id)) return null;
    return {
      chamberTableId: directChamber.id,
      chamberRegistryId: directChamber.entity_registry_id,
    };
  }

  const mainChamber = await resolveMainChamber(chamberRegistryId);
  if (!mainChamber) return null;

  const { data: mainRow } = await supabase
    .from("chambers")
    .select("id, entity_registry_id, building_object_id")
    .eq("id", mainChamber.chamberId)
    .maybeSingle();

  if (!mainRow?.id || !mainRow.entity_registry_id) return null;
  if (!buildingIds.includes(mainRow.building_object_id)) return null;

  return {
    chamberTableId: mainRow.id,
    chamberRegistryId: mainRow.entity_registry_id,
  };
}

async function isAgentAssignedToChamberTable(
  agentId: string,
  chamberTableId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("agent_assignments")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("chamber_id", chamberTableId);
  return (count ?? 0) > 0;
}

/** Internal evaluation — returns denial reason or null when access is allowed. */
export async function evaluateAgentContextAccess(
  params: AgentContextAccessParams,
): Promise<string | null> {
  const { officeId, agentId, chamberRegistryId } = params;

  const inOffice = await isAgentInOffice(agentId, officeId);
  if (!inOffice) return "agent_not_in_office";

  if (!chamberRegistryId?.trim()) return null;

  const chamber = await resolveChamberInOffice(chamberRegistryId.trim(), officeId);
  if (!chamber) return "chamber_not_in_office";

  const assigned = await isAgentAssignedToChamberTable(agentId, chamber.chamberTableId);
  if (!assigned) return "agent_not_assigned_to_chamber";

  return null;
}

/** Throws ContextAccessDeniedError when Tier A/B context access is not allowed. */
export async function assertAgentContextAccess(params: AgentContextAccessParams): Promise<void> {
  const reason = await evaluateAgentContextAccess(params);
  if (reason) {
    console.warn("[agent-context-access] denied:", reason, {
      officeId: params.officeId,
      agentId: params.agentId,
      chamberRegistryId: params.chamberRegistryId ?? null,
    });
    throw new ContextAccessDeniedError(reason);
  }
}

/** Defense in depth — used inside buildRegistryChainForContext when both ids are present. */
export async function assertAgentAssignedToChamberRegistry(
  agentId: string,
  chamberRegistryId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: chamber } = await supabase
    .from("chambers")
    .select("id")
    .eq("entity_registry_id", chamberRegistryId)
    .maybeSingle();

  if (!chamber?.id) {
    throw new ContextAccessDeniedError("defense: chamber_registry_unresolved");
  }

  const assigned = await isAgentAssignedToChamberTable(agentId, chamber.id);
  if (!assigned) {
    throw new ContextAccessDeniedError("defense: agent_not_assigned");
  }
}
