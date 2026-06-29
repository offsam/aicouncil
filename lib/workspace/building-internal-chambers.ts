import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type BuildingInternalChamber = {
  id: string;
  name: string;
  routing_description: string | null;
};

/** Resolve building registry id for a chamber row. */
export async function resolveBuildingRegistryIdForChamber(
  chamberRegistryId: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("chambers")
    .select("building_entity_id, building_object_id")
    .eq("entity_registry_id", chamberRegistryId)
    .maybeSingle();
  return data?.building_entity_id ?? data?.building_object_id ?? null;
}

/** Internal chambers of a building (excludes routing_role = main). */
export async function listBuildingInternalChambers(
  buildingRegistryId: string,
): Promise<BuildingInternalChamber[]> {
  const supabase = getSupabaseAdmin();
  const { data: chambers, error } = await supabase
    .from("chambers")
    .select("entity_registry_id, name, routing_role")
    .or(
      `building_entity_id.eq.${buildingRegistryId},building_object_id.eq.${buildingRegistryId}`,
    );

  if (error) {
    console.error("[listBuildingInternalChambers]", error.message);
    return [];
  }

  const internalRows = (chambers ?? []).filter((row) => row.routing_role !== "main");
  if (internalRows.length === 0) return [];

  const registryIds = internalRows.map((row) => row.entity_registry_id);
  const { data: registryRows } = await supabase
    .from("entity_registry")
    .select("id, name, routing_description")
    .in("id", registryIds);

  const registryById = new Map((registryRows ?? []).map((row) => [row.id, row]));

  return internalRows.map((row) => {
    const reg = registryById.get(row.entity_registry_id);
    return {
      id: row.entity_registry_id,
      name: reg?.name ?? row.name,
      routing_description: reg?.routing_description ?? null,
    };
  });
}

/** Manager main chamber → internal chamber requires send_tasks connection (project rule). */
export async function filterInternalChambersBySendTasksConnection(
  sourceChamberRegistryId: string,
  chambers: BuildingInternalChamber[],
): Promise<BuildingInternalChamber[]> {
  if (chambers.length === 0) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("connections")
    .select("target_entity_id, connection_permissions(send_tasks)")
    .eq("source_entity_id", sourceChamberRegistryId)
    .eq("is_active", true);

  if (error) {
    console.error("[filterInternalChambersBySendTasksConnection]", error.message);
    return [];
  }

  const allowedTargetIds = new Set(
    (data ?? [])
      .filter((row) => {
        const perms = row.connection_permissions as
          | { send_tasks?: boolean }
          | { send_tasks?: boolean }[]
          | null;
        const perm = Array.isArray(perms) ? perms[0] : perms;
        return perm?.send_tasks === true;
      })
      .map((row) => row.target_entity_id),
  );

  return chambers.filter((chamber) => allowedTargetIds.has(chamber.id));
}
