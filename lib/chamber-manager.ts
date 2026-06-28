import { getSupabaseAdmin } from "./supabase/admin";

/** agents.id for the chamber lead, if set. */
export async function resolveChamberManagerAgentId(
  targetChamberRegistryId: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data: chamber } = await supabase
    .from("chambers")
    .select("manager_agent_id")
    .eq("entity_registry_id", targetChamberRegistryId)
    .maybeSingle();
  return chamber?.manager_agent_id ?? null;
}

export async function clearChamberManagerIfAgent(
  chamberId: string,
  agentId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("chambers")
    .update({ manager_agent_id: null })
    .eq("id", chamberId)
    .eq("manager_agent_id", agentId);
}
