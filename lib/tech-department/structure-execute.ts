import { AI_COUNCIL_OFFICE_ID } from "../ai-council-ids";
import { seedDefaultChamberRoster } from "../chamber-default-roster";
import { ensureBuildingRegistry, resolveUniqueChamberSlug, validateConnectionEntities } from "../entity-registry-ensure";
import { getSupabaseAdmin } from "../supabase/admin";
import { NEW_CONNECTION_PERMISSIONS } from "../workspace/workspace-connections";
import type {
  StructureAction,
  StructureExecutionResult,
  TechStructurePlan,
} from "./structure-types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveRef(ref: string, refMap: Map<string, string>): string {
  const trimmed = ref.trim();
  if (UUID_RE.test(trimmed)) return trimmed;
  const mapped = refMap.get(trimmed);
  if (!mapped) {
    throw new Error(`Unresolved reference: ${trimmed}`);
  }
  return mapped;
}

async function executeCreateBuilding(
  action: Extract<StructureAction, { type: "create_building" }>,
  refMap: Map<string, string>,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("office_objects")
    .insert({
      office_id: AI_COUNCIL_OFFICE_ID,
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
      office_id: AI_COUNCIL_OFFICE_ID,
    },
    undefined,
  );

  if (action.ref) refMap.set(action.ref, data.id);
  refMap.set(data.id, data.id);
  return data.id;
}

async function executeCreateChamber(
  action: Extract<StructureAction, { type: "create_chamber" }>,
  refMap: Map<string, string>,
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

  await seedDefaultChamberRoster(supabase, {
    chamberId: chamber.id,
    chamberRegistryId: registry.id,
  });

  if (action.ref) refMap.set(action.ref, registry.id);
  refMap.set(registry.id, registry.id);
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

/** Ordered execution: building → chamber → assign → connection. */
function sortActionsForExecution(actions: StructureAction[]): StructureAction[] {
  const order: Record<string, number> = {
    create_building: 0,
    create_chamber: 1,
    assign_agent: 2,
    create_connection: 3,
  };
  return [...actions].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
}

export async function loadPendingStructurePlan(planId: string): Promise<TechStructurePlan | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tech_structure_plans")
    .select("id, task_text, plan_summary, actions, status, expires_at")
    .eq("id", planId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.status !== "pending") return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    await supabase
      .from("tech_structure_plans")
      .update({ status: "expired" })
      .eq("id", planId);
    return null;
  }

  return {
    planId: data.id,
    taskText: data.task_text,
    summary: data.plan_summary,
    actions: (data.actions ?? []) as StructureAction[],
    expiresAt: data.expires_at,
  };
}

export async function executeTechStructurePlan(planId: string): Promise<StructureExecutionResult> {
  const plan = await loadPendingStructurePlan(planId);
  if (!plan) {
    throw new Error("Plan not found, expired, or already executed");
  }

  const supabase = getSupabaseAdmin();
  const refMap = new Map<string, string>();
  const executed: StructureExecutionResult["executed"] = [];
  const sorted = sortActionsForExecution(plan.actions);

  for (let i = 0; i < sorted.length; i++) {
    const action = sorted[i];
    try {
      let detail = "ok";
      if (action.type === "create_building") {
        const id = await executeCreateBuilding(action, refMap);
        detail = `building id=${id}`;
      } else if (action.type === "create_chamber") {
        const id = await executeCreateChamber(action, refMap);
        detail = `chamber registry id=${id}`;
      } else if (action.type === "assign_agent") {
        await executeAssignAgent(action, refMap);
        detail = `assigned ${action.agent_id}`;
      } else if (action.type === "create_connection") {
        const id = await executeCreateConnection(action, refMap);
        detail = `connection id=${id}`;
      }
      executed.push({ actionIndex: i, type: action.type, ok: true, detail });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      executed.push({ actionIndex: i, type: action.type, ok: false, detail: message });
      await supabase
        .from("tech_structure_plans")
        .update({
          status: "cancelled",
          execution_result: { executed, error: message },
        })
        .eq("id", planId);
      throw new Error(`Step ${i + 1} (${action.type}) failed: ${message}`);
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
