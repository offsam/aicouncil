import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Finds chamber with routing_role = 'main' for buildingEntityRegistryId.
 * buildingEntityRegistryId references the building's record in entity_registry table.
 * However, chambers table has building_entity_id which is a foreign key to entity_registry.id.
 * So buildingEntityRegistryId is indeed building_entity_id in the chambers table!
 * Let's select id, entity_registry_id, and manager_agent_id.
 */
export async function resolveMainChamber(buildingEntityRegistryId: string): Promise<{
  chamberId: string;            // chambers.id (UUID)
  chamberRegistryId: string;    // entity_registry_id
  managerAgentId: string | null;
} | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("chambers")
    .select("id, entity_registry_id, manager_agent_id")
    .eq("building_entity_id", buildingEntityRegistryId)
    .eq("routing_role", "main")
    .maybeSingle();

  if (error) {
    console.error(`[resolveMainChamber] Error fetching main chamber for building ${buildingEntityRegistryId}:`, error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    chamberId: data.id,
    chamberRegistryId: data.entity_registry_id,
    managerAgentId: data.manager_agent_id,
  };
}
