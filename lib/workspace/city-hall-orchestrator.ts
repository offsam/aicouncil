import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import { isCityHallBuilding, resolveCanonicalCityHallBuilding } from "./city-hall-building";

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
  const supabase = getSupabaseAdmin();

  const { data: buildings } = await supabase
    .from("office_objects")
    .select("id, label, created_at")
    .eq("office_id", officeId)
    .eq("object_type", "room");

  const cityHallIds = (buildings ?? []).filter(isCityHallBuilding).map((b) => b.id);
  let chamberRows: ChamberRow[] = [];
  if (cityHallIds.length > 0) {
    const { data: chambers } = await supabase
      .from("chambers")
      .select("id, building_object_id, building_entity_id")
      .in("building_object_id", cityHallIds);
    chamberRows = (chambers ?? []) as ChamberRow[];
  }

  const cityHall = resolveCanonicalCityHallBuilding(
    (buildings ?? []) as OfficeObjectRow[],
    chamberRows,
  );
  if (!cityHall) return null;

  const { data: chamber } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id, manager_agent_id")
    .eq("building_object_id", cityHall.id)
    .eq("routing_role", "main")
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
