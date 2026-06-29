import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../supabase/admin";
import type {
  StructureAction,
  StructureImpactAnalysis,
  StructureImpactCounts,
  StructureSnapshotEntities,
} from "./structure-types";
import { isDestructiveStructureAction } from "./structure-types";

type ImpactAccumulator = {
  registryIds: Set<string>;
  chamberRowIds: Set<string>;
  connectionIds: Set<string>;
  assignmentIds: Set<string>;
  workflowStepIds: Set<string>;
  debateIds: Set<string>;
  officeObjectIds: Set<string>;
  archiveIds: Set<string>;
};

function emptySnapshotEntities(): StructureSnapshotEntities {
  return {
    entity_registry: [],
    office_objects: [],
    chambers: [],
    connections: [],
    connection_permissions: [],
    agent_assignments: [],
    workflow_steps: [],
    agent_debates: [],
    chamber_archive: [],
  };
}

async function loadChamberRowByRegistryId(
  supabase: SupabaseClient,
  chamberRegistryId: string,
): Promise<{ id: string; entity_registry_id: string; building_entity_id: string | null } | null> {
  const { data } = await supabase
    .from("chambers")
    .select("id, entity_registry_id, building_entity_id")
    .eq("entity_registry_id", chamberRegistryId)
    .maybeSingle();
  return data ?? null;
}

async function expandBuildingCascade(
  supabase: SupabaseClient,
  buildingId: string,
  acc: ImpactAccumulator,
): Promise<void> {
  acc.registryIds.add(buildingId);
  acc.officeObjectIds.add(buildingId);

  const { data: childRegistry } = await supabase
    .from("entity_registry")
    .select("id, entity_type, name")
    .eq("parent_entity_id", buildingId);

  for (const row of childRegistry ?? []) {
    acc.registryIds.add(row.id);
    if (row.entity_type === "chamber") {
      const chamberRow = await loadChamberRowByRegistryId(supabase, row.id);
      if (chamberRow) acc.chamberRowIds.add(chamberRow.id);
    }
  }

  const { data: chamberRows } = await supabase
    .from("chambers")
    .select("id, entity_registry_id")
    .or(`building_entity_id.eq.${buildingId},building_object_id.eq.${buildingId}`);

  for (const row of chamberRows ?? []) {
    acc.chamberRowIds.add(row.id);
    if (row.entity_registry_id) acc.registryIds.add(row.entity_registry_id);
  }
}

async function expandChamberCascade(
  supabase: SupabaseClient,
  chamberRegistryId: string,
  acc: ImpactAccumulator,
): Promise<void> {
  acc.registryIds.add(chamberRegistryId);
  const chamberRow = await loadChamberRowByRegistryId(supabase, chamberRegistryId);
  if (chamberRow) acc.chamberRowIds.add(chamberRow.id);
}

async function expandConnectionsForRegistryIds(
  supabase: SupabaseClient,
  registryIds: Set<string>,
  acc: ImpactAccumulator,
): Promise<void> {
  if (registryIds.size === 0) return;
  const ids = [...registryIds];
  const { data: asSource } = await supabase
    .from("connections")
    .select("id")
    .in("source_entity_id", ids);
  const { data: asTarget } = await supabase
    .from("connections")
    .select("id")
    .in("target_entity_id", ids);
  for (const row of [...(asSource ?? []), ...(asTarget ?? [])]) {
    acc.connectionIds.add(row.id);
  }
}

async function expandAssignmentsForChambers(
  supabase: SupabaseClient,
  chamberRowIds: Set<string>,
  acc: ImpactAccumulator,
): Promise<void> {
  if (chamberRowIds.size === 0) return;
  const { data } = await supabase
    .from("agent_assignments")
    .select("id")
    .in("chamber_id", [...chamberRowIds]);
  for (const row of data ?? []) {
    acc.assignmentIds.add(row.id);
  }
}

async function expandWorkflowStepsForChambers(
  supabase: SupabaseClient,
  registryIds: Set<string>,
  acc: ImpactAccumulator,
): Promise<void> {
  const chamberRegistryIds = [...registryIds];
  if (chamberRegistryIds.length === 0) return;
  const { data } = await supabase
    .from("workflow_steps")
    .select("id")
    .in("target_chamber_entity_id", chamberRegistryIds);
  for (const row of data ?? []) {
    acc.workflowStepIds.add(row.id);
  }
}

async function expandArchiveForRegistryIds(
  supabase: SupabaseClient,
  registryIds: Set<string>,
  acc: ImpactAccumulator,
): Promise<void> {
  if (registryIds.size === 0) return;
  const { data } = await supabase
    .from("chamber_archive")
    .select("id")
    .in("entity_registry_id", [...registryIds]);
  for (const row of data ?? []) {
    acc.archiveIds.add(row.id);
  }
}

async function expandDebatesForChambers(
  supabase: SupabaseClient,
  chamberRowIds: Set<string>,
  acc: ImpactAccumulator,
): Promise<void> {
  if (chamberRowIds.size === 0) return;
  const { data } = await supabase
    .from("agent_debates")
    .select("id")
    .in("debate_chamber_id", [...chamberRowIds]);
  for (const row of data ?? []) {
    acc.debateIds.add(row.id);
  }
}

async function applyDestructiveAction(
  supabase: SupabaseClient,
  action: StructureAction,
  acc: ImpactAccumulator,
): Promise<void> {
  if (!isDestructiveStructureAction(action)) return;

  switch (action.type) {
    case "delete_building":
      await expandBuildingCascade(supabase, action.building_id, acc);
      break;
    case "delete_chamber":
      await expandChamberCascade(supabase, action.chamber_registry_id, acc);
      break;
    case "delete_connection":
      acc.connectionIds.add(action.connection_id);
      break;
    case "unassign_agent": {
      const chamberRow = await loadChamberRowByRegistryId(supabase, action.chamber_ref);
      if (!chamberRow) return;
      const { data: assignment } = await supabase
        .from("agent_assignments")
        .select("id")
        .eq("agent_id", action.agent_id)
        .eq("chamber_id", chamberRow.id)
        .maybeSingle();
      if (assignment) acc.assignmentIds.add(assignment.id);
      break;
    }
  }
}

/** Collect cascade-affected entity ids from destructive plan actions (no DB writes). */
export async function collectDestructiveImpactIds(
  actions: StructureAction[],
  supabase: SupabaseClient = getSupabaseAdmin(),
): Promise<ImpactAccumulator> {
  const acc: ImpactAccumulator = {
    registryIds: new Set(),
    chamberRowIds: new Set(),
    connectionIds: new Set(),
    assignmentIds: new Set(),
    workflowStepIds: new Set(),
    debateIds: new Set(),
    officeObjectIds: new Set(),
    archiveIds: new Set(),
  };

  for (const action of actions) {
    await applyDestructiveAction(supabase, action, acc);
  }

  await expandConnectionsForRegistryIds(supabase, acc.registryIds, acc);
  await expandAssignmentsForChambers(supabase, acc.chamberRowIds, acc);
  await expandWorkflowStepsForChambers(supabase, acc.registryIds, acc);
  await expandDebatesForChambers(supabase, acc.chamberRowIds, acc);
  await expandArchiveForRegistryIds(supabase, acc.registryIds, acc);

  return acc;
}

async function fetchSnapshotEntities(
  acc: ImpactAccumulator,
  supabase: SupabaseClient = getSupabaseAdmin(),
): Promise<StructureSnapshotEntities> {
  const entities = emptySnapshotEntities();

  if (acc.registryIds.size > 0) {
    const { data } = await supabase
      .from("entity_registry")
      .select("*")
      .in("id", [...acc.registryIds]);
    entities.entity_registry = (data ?? []) as Record<string, unknown>[];
  }

  if (acc.officeObjectIds.size > 0) {
    const { data } = await supabase
      .from("office_objects")
      .select("*")
      .in("id", [...acc.officeObjectIds]);
    entities.office_objects = (data ?? []) as Record<string, unknown>[];
  }

  if (acc.chamberRowIds.size > 0) {
    const { data } = await supabase
      .from("chambers")
      .select("*")
      .in("id", [...acc.chamberRowIds]);
    entities.chambers = (data ?? []) as Record<string, unknown>[];
  }

  if (acc.connectionIds.size > 0) {
    const { data } = await supabase
      .from("connections")
      .select("*")
      .in("id", [...acc.connectionIds]);
    entities.connections = (data ?? []) as Record<string, unknown>[];
    const { data: perms } = await supabase
      .from("connection_permissions")
      .select("*")
      .in("connection_id", [...acc.connectionIds]);
    entities.connection_permissions = (perms ?? []) as Record<string, unknown>[];
  }

  if (acc.assignmentIds.size > 0) {
    const { data } = await supabase
      .from("agent_assignments")
      .select("*")
      .in("id", [...acc.assignmentIds]);
    entities.agent_assignments = (data ?? []) as Record<string, unknown>[];
  }

  if (acc.workflowStepIds.size > 0) {
    const { data } = await supabase
      .from("workflow_steps")
      .select("*")
      .in("id", [...acc.workflowStepIds]);
    entities.workflow_steps = (data ?? []) as Record<string, unknown>[];
  }

  if (acc.debateIds.size > 0) {
    const { data } = await supabase
      .from("agent_debates")
      .select("*")
      .in("id", [...acc.debateIds]);
    entities.agent_debates = (data ?? []) as Record<string, unknown>[];
  }

  if (acc.archiveIds.size > 0) {
    const { data } = await supabase
      .from("chamber_archive")
      .select("*")
      .in("id", [...acc.archiveIds]);
    entities.chamber_archive = (data ?? []) as Record<string, unknown>[];
  }

  return entities;
}

const IMPACT_LABELS: Record<keyof StructureImpactCounts, string> = {
  entity_registry: "записей entity_registry",
  office_objects: "объектов canvas (office_objects)",
  chambers: "отделов (chambers)",
  connections: "кабелей (connections)",
  connection_permissions: "наборов прав кабелей",
  agent_assignments: "назначений агентов",
  workflow_steps: "шагов workflow",
  agent_debates: "сессий agent_debates",
  chamber_archive: "записей chamber_archive",
};

function countsFromEntities(entities: StructureSnapshotEntities): StructureImpactCounts {
  return {
    entity_registry: entities.entity_registry.length,
    office_objects: entities.office_objects.length,
    chambers: entities.chambers.length,
    connections: entities.connections.length,
    connection_permissions: entities.connection_permissions.length,
    agent_assignments: entities.agent_assignments.length,
    workflow_steps: entities.workflow_steps.length,
    agent_debates: entities.agent_debates.length,
    chamber_archive: entities.chamber_archive.length,
  };
}

export function formatImpactSummaryLines(counts: StructureImpactCounts): string[] {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(IMPACT_LABELS) as [keyof StructureImpactCounts, string][]) {
    const n = counts[key];
    if (n > 0) lines.push(`- ${label}: ${n}`);
  }
  if (lines.length === 0) {
    lines.push("- Нет затронутых сущностей в схеме snapshot (проверьте id в плане).");
  }
  return lines;
}

/** Compute cascade impact + load full row snapshot for confirmation (read-only). */
export async function analyzeDestructiveStructureImpact(
  actions: StructureAction[],
): Promise<{ impact: StructureImpactAnalysis; entities: StructureSnapshotEntities }> {
  const acc = await collectDestructiveImpactIds(actions);
  const entities = await fetchSnapshotEntities(acc);
  const counts = countsFromEntities(entities);
  return {
    impact: {
      counts,
      summaryLines: formatImpactSummaryLines(counts),
    },
    entities,
  };
}

export async function persistStructureBeforeSnapshot(params: {
  planId: string;
  officeId: string;
  entities: StructureSnapshotEntities;
}): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tech_structure_snapshots")
    .insert({
      plan_id: params.planId,
      office_id: params.officeId,
      snapshot_type: "before",
      entities: params.entities,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to store structure before-snapshot");
  }
  return data.id;
}
