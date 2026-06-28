import { NextRequest, NextResponse } from "next/server";
import {
  chamberHasFreeAgent,
  selectAgentsForChamberEntity,
} from "@/lib/agent-selection";
import { normalizeCostTier } from "@/lib/cost-tier";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const entityId = request.nextUrl.searchParams.get("entityId")?.trim();
  if (!entityId) {
    return NextResponse.json({ error: "entityId обязателен" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const rosterAgents = await selectAgentsForChamberEntity(entityId, 0, {
    rosterOnly: true,
  });
  const rosterCount = rosterAgents.length;
  const nameIds = rosterAgents.map((a) => a.agentId);
  const { data: nameRows } =
      nameIds.length > 0
        ? await supabase.from("entity_registry").select("id, name").in("id", nameIds)
        : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((nameRows ?? []).map((row) => [row.id, row.name]));
  const { data: agentRows } = nameIds.length > 0
    ? await supabase.from("agents").select("id, cost_tier").in("id", nameIds)
    : { data: [] as { id: string; cost_tier: string | null }[] };
  const tierById = new Map((agentRows ?? []).map((row) => [row.id, normalizeCostTier(row.cost_tier)]));
  const tierCounts = { free: 0, cheap: 0, mid: 0, premium: 0 };
  for (const id of nameIds) {
    const tier = tierById.get(id) ?? "cheap";
    tierCounts[tier] += 1;
  }

  const { data: entity } = await supabase
    .from("entity_registry")
    .select("name")
    .eq("id", entityId)
    .maybeSingle();

  return NextResponse.json({
    entityId,
    chamberName: entity?.name ?? null,
    rosterCount,
    teamEligible: tierCounts.cheap > 0,
    councilEligible: tierCounts.mid > 0,
    turboEligible: tierCounts.premium > 0,
    tierCounts,
    hasFreeReserve: await chamberHasFreeAgent(entityId),
    agents: rosterAgents.map((agent) => ({
      id: agent.agentId,
      slug: agent.slug,
      name: nameById.get(agent.agentId) ?? agent.slug,
    })),
  });
}
