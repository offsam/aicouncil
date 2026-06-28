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
