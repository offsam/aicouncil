import { ensureBuildingRegistry, resolveUniqueChamberSlug, validateConnectionEntities } from "../entity-registry-ensure";
import { getSupabaseAdmin } from "../supabase/admin";
import { requireExternalEntryOfficeId } from "../workspace/graph-identity-required";
import { NEW_CONNECTION_PERMISSIONS } from "../workspace/workspace-connections";
import type {
  StructureAction,
  StructureExecutionResult,
  StructureImpactAnalysis,
  StructurePlanKind,
  TechStructurePlan,
} from "./structure-types";
import {
  isDestructiveStructureAction,
  planHasDestructiveActions,
} from "./structure-types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StructurePlanRow = {
  id: string;
  task_text: string;
  plan_summary: string;
  actions: unknown;
  status: string;
  expires_at: string | null;
  plan_kind: string | null;
  impact_analysis: unknown;
  snapshot_id: string | null;
  execution_result: StructureExecutionResultPayload | null;
};

type StructureExecutionResultPayload = {
  executed?: StructureExecutionResult["executed"];
  error?: string;
  failedStep?: number;
  failedType?: string;
  planKind?: StructurePlanKind;
  snapshotId?: string;
};

/** Strip leading $ from planner refs ($building1 → building1). */
export function normalizePlanRefKey(ref: string): string {
  const trimmed = ref.trim();
  return trimmed.startsWith("$") ? trimmed.slice(1) : trimmed;
}

/** Register all common alias forms for a planner ref. */
export function registerPlanRef(refMap: Map<string, string>, alias: string, id: string): void {
  const trimmed = alias.trim();
  if (!trimmed) return;
  const bare = normalizePlanRefKey(trimmed);
  refMap.set(trimmed, id);
  refMap.set(bare, id);
  refMap.set(`$${bare}`, id);
  refMap.set(id, id);
}

export function resolveRef(ref: string, refMap: Map<string, string>): string {
  const trimmed = ref.trim();
  if (UUID_RE.test(trimmed)) return trimmed;

  const bare = normalizePlanRefKey(trimmed);
  for (const key of [trimmed, bare, `$${bare}`]) {
    const mapped = refMap.get(key);
    if (mapped) return mapped;
  }

  throw new Error(`Unresolved reference: ${trimmed}`);
}

function registerBuildingRefs(
  refMap: Map<string, string>,
  id: string,
  ordinal: number,
  explicitRef?: string,
): void {
  if (explicitRef) registerPlanRef(refMap, explicitRef, id);
  registerPlanRef(refMap, `building${ordinal}`, id);
}

function registerChamberRefs(
  refMap: Map<string, string>,
  registryId: string,
  ordinal: number,
  explicitRef?: string,
): void {
  if (explicitRef) registerPlanRef(refMap, explicitRef, registryId);
  registerPlanRef(refMap, `chamber${ordinal}`, registryId);
}

async function executeCreateBuilding(
  action: Extract<StructureAction, { type: "create_building" }>,
  refMap: Map<string, string>,
  officeId: string,
  ordinal: number,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("office_objects")
    .insert({
      office_id: officeId,
      object_type: "room",
      position_x: action.position_x ?? 20,
      position_z: action.position_z ?? 20,
      size_w: action.size_w ?? 18,
      size_d: action.size_d ?? 15,
      label: action.label,
      color: action.color ?? "slate",
    })
    .select("id, label")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create building");
  }

  await ensureBuildingRegistry(
    supabase,
    {
      id: data.id,
      label: data.label,
      routing_description: action.routing_description,
      office_id: officeId,
    },
    undefined,
  );

  registerBuildingRefs(refMap, data.id, ordinal, action.ref);
  return data.id;
}

async function executeCreateChamber(
  action: Extract<StructureAction, { type: "create_chamber" }>,
  refMap: Map<string, string>,
  ordinal: number,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const buildingId = resolveRef(action.building_ref, refMap);
  const slug = await resolveUniqueChamberSlug(supabase, buildingId, action.name);

  const { data: registry, error: regError } = await supabase
    .from("entity_registry")
    .insert({
      entity_type: "chamber",
      name: action.name,
      slug,
      parent_entity_id: buildingId,
      ...(action.routing_description ? { routing_description: action.routing_description } : {}),
    })
    .select("id")
    .single();

  if (regError || !registry) {
    throw new Error(regError?.message ?? "Failed to register chamber");
  }

  const { data: chamber, error: chamError } = await supabase
    .from("chambers")
    .insert({
      entity_registry_id: registry.id,
      building_entity_id: buildingId,
      building_object_id: buildingId,
      name: action.name,
      x: action.x ?? 2,
      z: action.z ?? 2,
      width: action.width ?? 4,
      depth: action.depth ?? 4,
      routing_role: action.routing_role ?? null,
    })
    .select("id, entity_registry_id")
    .single();

  if (chamError || !chamber) {
    await supabase.from("entity_registry").delete().eq("id", registry.id);
    throw new Error(chamError?.message ?? "Failed to create chamber row");
  }

  registerChamberRefs(refMap, registry.id, ordinal, action.ref);
  return registry.id;
}

async function executeAssignAgent(
  action: Extract<StructureAction, { type: "assign_agent" }>,
  refMap: Map<string, string>,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const chamberRegistryId = resolveRef(action.chamber_ref, refMap);

  const { data: chamberRow } = await supabase
    .from("chambers")
    .select("id")
    .eq("entity_registry_id", chamberRegistryId)
    .maybeSingle();

  if (!chamberRow) {
    throw new Error(`Chamber not found for ref ${action.chamber_ref}`);
  }

  const { data: existing } = await supabase
    .from("agent_assignments")
    .select("id")
    .eq("agent_id", action.agent_id)
    .eq("chamber_id", chamberRow.id)
    .maybeSingle();

  if (existing) {
    return;
  }

  const { error } = await supabase.from("agent_assignments").insert({
    agent_id: action.agent_id,
    chamber_id: chamberRow.id,
    role: action.role ?? "member",
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function executeCreateConnection(
  action: Extract<StructureAction, { type: "create_connection" }>,
  refMap: Map<string, string>,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const sourceId = resolveRef(action.source_ref, refMap);
  const targetId = resolveRef(action.target_ref, refMap);

  const validation = await validateConnectionEntities(supabase, sourceId, targetId);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const { data: existing } = await supabase
    .from("connections")
    .select("id")
    .eq("source_entity_id", sourceId)
    .eq("target_entity_id", targetId)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: conn, error: connErr } = await supabase
    .from("connections")
    .insert({
      source_entity_id: sourceId,
      target_entity_id: targetId,
      priority: 0,
      is_active: true,
    })
    .select("id")
    .single();

  if (connErr || !conn) {
    throw new Error(connErr?.message ?? "Failed to create connection");
  }

  const { error: permsErr } = await supabase.from("connection_permissions").insert({
    connection_id: conn.id,
    read_knowledge: action.read_knowledge ?? NEW_CONNECTION_PERMISSIONS.read_knowledge,
    read_rules: action.read_rules ?? NEW_CONNECTION_PERMISSIONS.read_rules,
    read_results: action.read_results ?? NEW_CONNECTION_PERMISSIONS.read_results,
    send_tasks: action.send_tasks ?? NEW_CONNECTION_PERMISSIONS.send_tasks,
  });

  if (permsErr) {
    await supabase.from("connections").delete().eq("id", conn.id);
    throw new Error(permsErr.message);
  }

  return conn.id;
}

/** Execute in planner order — refs resolve from prior steps in the same plan. */
function orderActionsForExecution(actions: StructureAction[]): StructureAction[] {
  return [...actions];
}

export function formatFailedStructurePlanMessage(payload: StructureExecutionResultPayload): string {
  const failedStep =
    payload.failedStep ??
    (payload.executed?.find((step) => !step.ok)?.actionIndex ?? 0) + 1;
  const failedType =
    payload.failedType ??
    payload.executed?.find((step) => !step.ok)?.type ??
    "unknown";
  const error = payload.error ?? "неизвестная ошибка";
  return `План прерван ошибкой на шаге ${failedStep} (${failedType}): ${error}. Повторное выполнение невозможно, создайте план заново.`;
}

async function loadStructurePlanRow(planId: string): Promise<StructurePlanRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tech_structure_plans")
    .select(
      "id, task_text, plan_summary, actions, status, expires_at, plan_kind, impact_analysis, snapshot_id, execution_result",
    )
    .eq("id", planId)
    .maybeSingle();

  if (error || !data) return null;
  return data as StructurePlanRow;
}

function rowToTechStructurePlan(row: StructurePlanRow): TechStructurePlan {
  return {
    planId: row.id,
    taskText: row.task_text,
    summary: row.plan_summary,
    actions: (row.actions ?? []) as StructureAction[],
    expiresAt: row.expires_at ?? new Date().toISOString(),
    planKind: (row.plan_kind ?? "create") as StructurePlanKind,
    impactAnalysis: (row.impact_analysis ?? undefined) as StructureImpactAnalysis | undefined,
    snapshotId: row.snapshot_id ?? undefined,
  };
}

export async function loadPendingStructurePlan(planId: string): Promise<TechStructurePlan | null> {
  const row = await loadStructurePlanRow(planId);
  if (!row || row.status !== "pending") return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    const supabase = getSupabaseAdmin();
    await supabase.from("tech_structure_plans").update({ status: "expired" }).eq("id", planId);
    return null;
  }
  return rowToTechStructurePlan(row);
}

function resolvePlanExecutionBlock(row: StructurePlanRow): string | null {
  if (row.status === "failed") {
    return formatFailedStructurePlanMessage(row.execution_result ?? {});
  }
  if (row.status === "executed") {
    return "План уже выполнен. Создайте новый план для дальнейших изменений.";
  }
  if (row.status === "cancelled") {
    if (row.execution_result?.error) {
      return formatFailedStructurePlanMessage(row.execution_result);
    }
    return "План отменён. Создайте новый план для выполнения изменений.";
  }
  if (row.status === "expired") {
    return "Срок действия плана истёк. Создайте новый план.";
  }
  if (row.status === "pending") {
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return "Срок действия плана истёк. Создайте новый план.";
    }
    return null;
  }
  return "Plan not found, expired, or already executed";
}

function assertDestructiveActionsOnly(actions: StructureAction[]): void {
  if (actions.length === 0) {
    throw new Error("Destructive plan has no actions");
  }
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!isDestructiveStructureAction(action)) {
      throw new Error(`Unsupported action type for destructive execute at step ${i + 1}: ${action.type}`);
    }
  }
}

function destructiveActionsForRpc(actions: StructureAction[]): Record<string, unknown>[] {
  return actions.map((action) => {
    switch (action.type) {
      case "delete_building":
        return { type: action.type, building_id: action.building_id };
      case "delete_chamber":
        return { type: action.type, chamber_registry_id: action.chamber_registry_id };
      case "delete_connection":
        return { type: action.type, connection_id: action.connection_id };
      case "unassign_agent":
        return {
          type: action.type,
          agent_id: action.agent_id,
          chamber_ref: action.chamber_ref,
        };
      default:
        throw new Error(`Unsupported destructive action type: ${(action as StructureAction).type}`);
    }
  });
}

async function executeDestructiveStructurePlan(
  planId: string,
  plan: TechStructurePlan,
): Promise<StructureExecutionResult> {
  if (plan.planKind !== "destructive") {
    throw new Error("Plan is not marked as destructive");
  }

  assertDestructiveActionsOnly(plan.actions);

  const supabase = getSupabaseAdmin();
  const rpcActions = destructiveActionsForRpc(plan.actions);

  try {
    const { data, error } = await supabase.rpc("execute_destructive_structure_plan", {
      actions: rpcActions,
    });

    if (error) {
      throw new Error(error.message);
    }

    const payload = (data ?? {}) as { executed?: StructureExecutionResult["executed"] };
    const executed = payload.executed ?? [];

    await supabase
      .from("tech_structure_plans")
      .update({
        status: "executed",
        executed_at: new Date().toISOString(),
        execution_result: {
          planKind: "destructive",
          snapshotId: plan.snapshotId,
          executed,
        },
      })
      .eq("id", planId);

    return { planId, executed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("tech_structure_plans")
      .update({
        status: "failed",
        execution_result: {
          error: message,
          planKind: "destructive",
          snapshotId: plan.snapshotId,
        },
      })
      .eq("id", planId);
    throw new Error(message);
  }
}

export async function executeTechStructurePlan(planId: string): Promise<StructureExecutionResult> {
  const row = await loadStructurePlanRow(planId);
  if (!row) {
    throw new Error("Plan not found, expired, or already executed");
  }

  const blockMessage = resolvePlanExecutionBlock(row);
  if (blockMessage) {
    if (row.status === "pending" && row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      const supabase = getSupabaseAdmin();
      await supabase.from("tech_structure_plans").update({ status: "expired" }).eq("id", planId);
    }
    throw new Error(blockMessage);
  }

  const plan = rowToTechStructurePlan(row);

  if (plan.planKind === "destructive") {
    return executeDestructiveStructurePlan(planId, plan);
  }

  if (planHasDestructiveActions(plan.actions)) {
    throw new Error(
      "Plan contains destructive actions but plan_kind is not destructive. Create a new plan.",
    );
  }

  const supabase = getSupabaseAdmin();
  const officeId = await requireExternalEntryOfficeId();
  const refMap = new Map<string, string>();
  const executed: StructureExecutionResult["executed"] = [];
  const ordered = orderActionsForExecution(plan.actions);
  let buildingOrdinal = 0;
  let chamberOrdinal = 0;

  for (let i = 0; i < ordered.length; i++) {
    const action = ordered[i];
    try {
      let detail = "ok";
      if (action.type === "create_building") {
        buildingOrdinal += 1;
        const id = await executeCreateBuilding(action, refMap, officeId, buildingOrdinal);
        detail = `building id=${id}`;
      } else if (action.type === "create_chamber") {
        chamberOrdinal += 1;
        const id = await executeCreateChamber(action, refMap, chamberOrdinal);
        detail = `chamber registry id=${id}`;
      } else if (action.type === "assign_agent") {
        await executeAssignAgent(action, refMap);
        detail = `assigned ${action.agent_id}`;
      } else if (action.type === "create_connection") {
        const id = await executeCreateConnection(action, refMap);
        detail = `connection id=${id}`;
      } else {
        throw new Error(`Unsupported action type for create execute: ${action.type}`);
      }
      executed.push({ actionIndex: i, type: action.type, ok: true, detail });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedStep = i + 1;
      executed.push({ actionIndex: i, type: action.type, ok: false, detail: message });
      await supabase
        .from("tech_structure_plans")
        .update({
          status: "failed",
          execution_result: {
            executed,
            error: message,
            failedStep,
            failedType: action.type,
          },
        })
        .eq("id", planId);
      throw new Error(formatFailedStructurePlanMessage({ executed, error: message, failedStep, failedType: action.type }));
    }
  }

  await supabase
    .from("tech_structure_plans")
    .update({
      status: "executed",
      executed_at: new Date().toISOString(),
      execution_result: { executed },
    })
    .eq("id", planId);

  return { planId, executed };
}

export async function cancelTechStructurePlan(planId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("tech_structure_plans")
    .update({ status: "cancelled" })
    .eq("id", planId)
    .eq("status", "pending");
}
