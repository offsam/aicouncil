import { getSupabaseAdmin } from "../supabase/admin";
import { requireExternalEntryOfficeId } from "../workspace/graph-identity-required";
import { invokeCheapLLM } from "../cheap-llm";
import {
  analyzeDestructiveStructureImpact,
  persistStructureBeforeSnapshot,
} from "./structure-impact";
import type { StructureAction, StructurePlanKind, TechStructurePlan } from "./structure-types";
import { planHasDestructiveActions } from "./structure-types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCreateActions(raw: unknown): StructureAction[] {
  if (!Array.isArray(raw)) return [];
  const actions: StructureAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = row.type;
    const description = String(row.description ?? "").trim() || "Действие";
    const ref = row.ref != null ? String(row.ref) : undefined;

    if (type === "create_building") {
      const label = String(row.label ?? "").trim();
      const routing_description = String(row.routing_description ?? "").trim();
      if (!label || !routing_description) continue;
      actions.push({
        type: "create_building",
        ref,
        description,
        label,
        routing_description,
        position_x: typeof row.position_x === "number" ? row.position_x : undefined,
        position_z: typeof row.position_z === "number" ? row.position_z : undefined,
        size_w: typeof row.size_w === "number" ? row.size_w : undefined,
        size_d: typeof row.size_d === "number" ? row.size_d : undefined,
        color: row.color != null ? String(row.color) : undefined,
      });
    } else if (type === "create_chamber") {
      const building_ref = String(row.building_ref ?? "").trim();
      const name = String(row.name ?? "").trim();
      if (!building_ref || !name) continue;
      actions.push({
        type: "create_chamber",
        ref,
        description,
        building_ref,
        name,
        routing_description:
          row.routing_description != null ? String(row.routing_description) : undefined,
        x: typeof row.x === "number" ? row.x : undefined,
        z: typeof row.z === "number" ? row.z : undefined,
        width: typeof row.width === "number" ? row.width : undefined,
        depth: typeof row.depth === "number" ? row.depth : undefined,
        routing_role: row.routing_role === "main" ? "main" : null,
      });
    } else if (type === "create_connection") {
      const source_ref = String(row.source_ref ?? "").trim();
      const target_ref = String(row.target_ref ?? "").trim();
      if (!source_ref || !target_ref) continue;
      actions.push({
        type: "create_connection",
        ref,
        description,
        source_ref,
        target_ref,
        read_knowledge: row.read_knowledge === true,
        read_rules: row.read_rules === true,
        read_results: row.read_results === true,
        send_tasks: row.send_tasks === true,
      });
    } else if (type === "assign_agent") {
      const agent_id = String(row.agent_id ?? "").trim();
      const chamber_ref = String(row.chamber_ref ?? "").trim();
      if (!agent_id || !chamber_ref) continue;
      actions.push({
        type: "assign_agent",
        ref,
        description,
        agent_id,
        chamber_ref,
        role: row.role != null ? String(row.role) : "member",
      });
    }
  }
  return actions;
}

function parseDestructiveActions(raw: unknown): StructureAction[] {
  if (!Array.isArray(raw)) return [];
  const actions: StructureAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = row.type;
    const description = String(row.description ?? "").trim() || "Действие";

    if (type === "delete_building") {
      const building_id = String(row.building_id ?? "").trim();
      if (!UUID_RE.test(building_id)) continue;
      actions.push({ type: "delete_building", description, building_id });
    } else if (type === "delete_chamber") {
      const chamber_registry_id = String(row.chamber_registry_id ?? row.chamber_id ?? "").trim();
      if (!UUID_RE.test(chamber_registry_id)) continue;
      actions.push({ type: "delete_chamber", description, chamber_registry_id });
    } else if (type === "delete_connection") {
      const connection_id = String(row.connection_id ?? "").trim();
      if (!UUID_RE.test(connection_id)) continue;
      actions.push({ type: "delete_connection", description, connection_id });
    } else if (type === "unassign_agent") {
      const agent_id = String(row.agent_id ?? "").trim();
      const chamber_ref = String(row.chamber_ref ?? "").trim();
      if (!UUID_RE.test(agent_id) || !UUID_RE.test(chamber_ref)) continue;
      actions.push({ type: "unassign_agent", description, agent_id, chamber_ref });
    }
  }
  return actions;
}

const PLACEHOLDER_ACTION_DESCRIPTIONS = new Set(["действие", "action", "шаг", "step"]);

function assertConfirmableStructureActions(actions: StructureAction[]): void {
  if (actions.length === 0) {
    throw new Error("Planner returned empty action list");
  }
  const allPlaceholder = actions.every((action) =>
    PLACEHOLDER_ACTION_DESCRIPTIONS.has(action.description.trim().toLowerCase()),
  );
  if (allPlaceholder) {
    throw new Error("Planner returned placeholder-only actions");
  }
}

function formatActionList(actions: StructureAction[]): string {
  return actions.map((a, i) => `${i + 1}. [${a.type}] ${a.description}`).join("\n");
}

async function storeStructurePlan(params: {
  taskText: string;
  summary: string;
  actions: StructureAction[];
  planKind: StructurePlanKind;
  impactAnalysis?: TechStructurePlan["impactAnalysis"];
  snapshotId?: string;
}): Promise<{ planId: string; expiresAt: string }> {
  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data: row, error } = await supabase
    .from("tech_structure_plans")
    .insert({
      task_text: params.taskText,
      plan_summary: params.summary,
      actions: params.actions,
      status: "pending",
      expires_at: expiresAt,
      plan_kind: params.planKind,
      impact_analysis: params.impactAnalysis ?? null,
      snapshot_id: params.snapshotId ?? null,
    })
    .select("id, expires_at")
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? "Failed to store structure plan");
  }

  return { planId: row.id, expiresAt: row.expires_at ?? expiresAt };
}

async function attachDestructiveImpactAndSnapshot(
  planId: string,
  officeId: string,
  actions: StructureAction[],
): Promise<{ impactAnalysis: TechStructurePlan["impactAnalysis"]; snapshotId: string }> {
  const { impact, entities } = await analyzeDestructiveStructureImpact(actions);
  const snapshotId = await persistStructureBeforeSnapshot({ planId, officeId, entities });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tech_structure_plans")
    .update({
      impact_analysis: impact,
      snapshot_id: snapshotId,
    })
    .eq("id", planId);

  if (error) {
    throw new Error(error.message);
  }

  return { impactAnalysis: impact, snapshotId };
}

/**
 * Parse user command into a pending create-only structure plan (no DB writes except plan storage).
 */
export async function createTechStructurePlan(taskText: string): Promise<TechStructurePlan> {
  const supabase = getSupabaseAdmin();
  const officeId = await requireExternalEntryOfficeId();

  const [{ data: buildings }, { data: chambers }, { data: agents }] = await Promise.all([
    supabase
      .from("entity_registry")
      .select("id, name, slug, routing_description")
      .eq("entity_type", "building"),
    supabase
      .from("entity_registry")
      .select("id, name, slug, parent_entity_id, routing_description")
      .eq("entity_type", "chamber"),
    supabase.from("agents").select("id, name, provider").eq("office_id", officeId),
  ]);

  const prompt = `You are the Tech Department planner. The user wants to change system structure. Produce a JSON object ONLY:
{
  "summary": "human-readable plan in Russian for user confirmation",
  "actions": [
    {
      "type": "create_building" | "create_chamber" | "create_connection" | "assign_agent",
      "ref": "$optionalRef",
      "description": "what this step does",
      ... type-specific fields ...
    }
  ]
}

Rules:
- Use refs ($building1, $chamber1) for entities created in the same plan; reference existing entities by UUID.
- Safe order in actions array: create_building → create_chamber → assign_agent → create_connection.
- Do NOT include destructive actions.
- create_building requires: label, routing_description. Default position_x=20, position_z=20, size_w=18, size_d=15.
- create_chamber requires: building_ref, name. Optional routing_description, routing_role="main" only for first/main chamber.
- create_connection requires: source_ref, target_ref (entity registry ids).
- assign_agent requires: agent_id (UUID), chamber_ref.

Existing buildings:
${(buildings ?? []).map((b) => `- ${b.id} ${b.name}: ${b.routing_description ?? ""}`).join("\n")}

Existing chambers:
${(chambers ?? []).map((c) => `- ${c.id} ${c.name} parent=${c.parent_entity_id}`).join("\n")}

Available agents:
${(agents ?? []).map((a) => `- ${a.id} ${a.name} (${a.provider})`).join("\n")}

User command: "${taskText.replace(/"/g, '\\"')}"`;

  const responseText = await invokeCheapLLM({
    purpose: "tech-structure-plan",
    prompt,
    responseFormat: "json",
    officeId,
  });
  const jsonMatch = responseText.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Planner did not return JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; actions?: unknown };
  const actions = parseCreateActions(parsed.actions);
  assertConfirmableStructureActions(actions);

  const summary =
    String(parsed.summary ?? "").trim() ||
    `План из ${actions.length} шагов:\n${formatActionList(actions)}`;

  const { planId, expiresAt } = await storeStructurePlan({
    taskText,
    summary,
    actions,
    planKind: "create",
  });

  return {
    planId,
    taskText,
    summary,
    actions,
    expiresAt,
    planKind: "create",
  };
}

/**
 * TD-03B: destructive plan + impact analysis + before-snapshot (non-executable).
 */
export async function createDestructiveStructurePlan(taskText: string): Promise<TechStructurePlan> {
  const supabase = getSupabaseAdmin();
  const officeId = await requireExternalEntryOfficeId();

  const [{ data: buildings }, { data: chambers }, { data: connections }, { data: agents }] =
    await Promise.all([
      supabase
        .from("entity_registry")
        .select("id, name, slug, routing_description")
        .eq("entity_type", "building"),
      supabase
        .from("entity_registry")
        .select("id, name, slug, parent_entity_id, routing_description")
        .eq("entity_type", "chamber"),
      supabase.from("connections").select("id, source_entity_id, target_entity_id, is_active"),
      supabase.from("agents").select("id, name, provider").eq("office_id", officeId),
    ]);

  const prompt = `You are the Tech Department destructive planner. The user wants to REMOVE or UNASSIGN workspace structure. Produce JSON ONLY:
{
  "summary": "human-readable destructive plan in Russian for user confirmation",
  "actions": [
    {
      "type": "delete_building" | "delete_chamber" | "delete_connection" | "unassign_agent",
      "description": "what this step does"
      ... type-specific UUID fields ...
    }
  ]
}

Allowed action types ONLY:
- delete_building: requires building_id (entity_registry UUID of building)
- delete_chamber: requires chamber_registry_id (entity_registry UUID of chamber)
- delete_connection: requires connection_id (connections.id UUID)
- unassign_agent: requires agent_id + chamber_ref (chamber entity_registry UUID). NEVER delete from global agents catalog.

FORBIDDEN: delete_agent, remove_agent_from_catalog, any action that deletes rows from agents table.

Reference existing entities by exact UUID from lists below.

Existing buildings:
${(buildings ?? []).map((b) => `- ${b.id} ${b.name}`).join("\n")}

Existing chambers:
${(chambers ?? []).map((c) => `- ${c.id} ${c.name} parent=${c.parent_entity_id}`).join("\n")}

Existing connections:
${(connections ?? []).map((c) => `- ${c.id} ${c.source_entity_id} → ${c.target_entity_id} active=${c.is_active}`).join("\n")}

Agents (for unassign_agent only — do NOT delete agent records):
${(agents ?? []).map((a) => `- ${a.id} ${a.name}`).join("\n")}

User command: "${taskText.replace(/"/g, '\\"')}"`;

  const responseText = await invokeCheapLLM({
    purpose: "tech-structure-plan-destructive",
    prompt,
    responseFormat: "json",
    officeId,
  });
  const jsonMatch = responseText.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Destructive planner did not return JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; actions?: unknown };
  const actions = parseDestructiveActions(parsed.actions);
  assertConfirmableStructureActions(actions);

  if (!planHasDestructiveActions(actions)) {
    throw new Error("Destructive planner returned no destructive actions");
  }

  const summary =
    String(parsed.summary ?? "").trim() ||
    `План удаления (${actions.length} шагов):\n${formatActionList(actions)}`;

  const { planId, expiresAt } = await storeStructurePlan({
    taskText,
    summary,
    actions,
    planKind: "destructive",
  });

  const { impactAnalysis, snapshotId } = await attachDestructiveImpactAndSnapshot(
    planId,
    officeId,
    actions,
  );

  return {
    planId,
    taskText,
    summary,
    actions,
    expiresAt,
    planKind: "destructive",
    impactAnalysis,
    snapshotId,
  };
}

export function formatStructurePlanForUser(plan: TechStructurePlan): string {
  const isDestructive = plan.planKind === "destructive";
  const lines = [
    isDestructive
      ? "Технический отдел подготовил план удаления. Подтвердите выполнение:"
      : "Технический отдел подготовил план изменений. Подтвердите выполнение:",
    "",
    plan.summary,
    "",
    "Детали:",
    ...plan.actions.map((a, i) => `${i + 1}. [${a.type}] ${a.description}`),
  ];

  if (plan.impactAnalysis?.summaryLines.length) {
    lines.push("", "Анализ последствий (каскад):", ...plan.impactAnalysis.summaryLines);
  }

  if (plan.snapshotId) {
    lines.push("", `Before-snapshot сохранён: ${plan.snapshotId}`);
  }

  lines.push(
    "",
    isDestructive
      ? "Подтвердите выполнение — удаление необратимо (before-snapshot сохранён для диагностики)."
      : "Без подтверждения изменения в базу не вносятся.",
  );

  return lines.join("\n");
}

/** Deterministic destructive plan for tests (bypasses LLM). */
export async function createDestructiveStructurePlanFromActions(
  taskText: string,
  actions: StructureAction[],
): Promise<TechStructurePlan> {
  if (!planHasDestructiveActions(actions)) {
    throw new Error("Actions must include at least one destructive step");
  }
  assertConfirmableStructureActions(actions);

  const officeId = await requireExternalEntryOfficeId();
  const summary = `Тестовый план удаления:\n${formatActionList(actions)}`;

  const { planId, expiresAt } = await storeStructurePlan({
    taskText,
    summary,
    actions,
    planKind: "destructive",
  });

  const { impactAnalysis, snapshotId } = await attachDestructiveImpactAndSnapshot(
    planId,
    officeId,
    actions,
  );

  return {
    planId,
    taskText,
    summary,
    actions,
    expiresAt,
    planKind: "destructive",
    impactAnalysis,
    snapshotId,
  };
}
