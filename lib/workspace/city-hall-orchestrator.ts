import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveMainChamberForBuilding } from "./graph-identity";
import { requireCityHallBuildingId } from "./graph-identity-required";

export type CityHallOrchestrator = {
  chamberRegistryId: string;
  chamberName: string;
  agentId: string;
  agentName: string;
};

/** Primary agent in City Hall — chamber with routing_role = 'main' only. */
export async function resolveCityHallMainAgent(
  officeId: string,
): Promise<CityHallOrchestrator | null> {
  const buildingId = await requireCityHallBuildingId(officeId);

  const main = await resolveMainChamberForBuilding(buildingId);
  if (!main?.chamberRegistryId) return null;

  const supabase = getSupabaseAdmin();
  const { data: chamber } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id, manager_agent_id")
    .eq("id", main.chamberId)
    .maybeSingle();

  if (!chamber?.entity_registry_id) return null;

  let agentId = chamber.manager_agent_id;
  let agentName: string | null = null;

  if (agentId) {
    const { data: agent } = await supabase
      .from("agents")
      .select("name")
      .eq("id", agentId)
      .maybeSingle();
    agentName = agent?.name ?? null;
  } else {
    const { data: assignment } = await supabase
      .from("agent_assignments")
      .select("agent_id, agents(name)")
      .eq("chamber_id", chamber.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const agentsJoin = assignment?.agents as { name?: string } | { name?: string }[] | null;
    agentId = assignment?.agent_id ?? null;
    agentName = Array.isArray(agentsJoin) ? agentsJoin[0]?.name ?? null : agentsJoin?.name ?? null;
  }

  if (!agentId) return null;

  return {
    chamberRegistryId: chamber.entity_registry_id,
    chamberName: chamber.name,
    agentId,
    agentName: agentName ?? "Mayor",
  };
}
