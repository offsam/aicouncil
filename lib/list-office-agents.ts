import type { AgentRow } from "./office-types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * All agents available in an office/city pool.
 * Includes agents with office_id set and entity_registry parent link under the office.
 */
export async function listOfficeAgents(
  supabase: SupabaseClient,
  officeId: string,
): Promise<AgentRow[]> {
  const { data: byOffice, error: officeError } = await supabase
    .from("agents")
    .select("*")
    .eq("office_id", officeId);

  if (officeError) {
    throw new Error(officeError.message);
  }

  const { data: registryRows, error: registryError } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("entity_type", "agent")
    .eq("parent_entity_id", officeId);

  if (registryError) {
    throw new Error(registryError.message);
  }

  const extraIds = new Set<string>();
  for (const row of registryRows ?? []) {
    extraIds.add(row.id);
  }

  const knownIds = new Set((byOffice ?? []).map((a) => a.id));
  const missingIds = [...extraIds].filter((id) => !knownIds.has(id));

  let extras: AgentRow[] = [];
  if (missingIds.length > 0) {
    const { data, error } = await supabase.from("agents").select("*").in("id", missingIds);
    if (error) {
      throw new Error(error.message);
    }
    extras = (data ?? []) as AgentRow[];
  }

  const merged = new Map<string, AgentRow>();
  for (const agent of [...(byOffice ?? []), ...extras]) {
    merged.set(agent.id, agent as AgentRow);
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
