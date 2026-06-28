import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteLogRow = {
  id: string;
  task_text: string;
  chosen_target_entity_registry_id: string | null;
  all_candidates: unknown;
  method: string | null;
  agent_count: number | null;
  outcome: string | null;
  routing_action: string | null;
  routing_matched_by: string | null;
  routing_confidence: number | null;
  routing_reasoning: string | null;
  routing_trace: string | null;
  delegated_building_id: string | null;
  delegated_chamber_id: string | null;
  delegated_agent_id: string | null;
  delegated_answer: string | null;
  summary_applied: boolean | null;
  created_at: string;
};

type RegistryRow = {
  id: string;
  name: string | null;
  entity_type: string | null;
};

type ActivityFeedRow = RouteLogRow & {
  chosen_target_name: string | null;
  delegated_building_name: string | null;
  delegated_chamber_name: string | null;
  delegated_agent_name: string | null;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ logs: [] });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: logs, error } = await supabase
      .from("routing_logs")
      .select(
        "id, task_text, chosen_target_entity_registry_id, all_candidates, method, agent_count, outcome, routing_action, routing_matched_by, routing_confidence, routing_reasoning, routing_trace, delegated_building_id, delegated_chamber_id, delegated_agent_id, delegated_answer, summary_applied, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (logs ?? []) as RouteLogRow[];
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.chosen_target_entity_registry_id) ids.add(row.chosen_target_entity_registry_id);
      if (row.delegated_building_id) ids.add(row.delegated_building_id);
      if (row.delegated_chamber_id) ids.add(row.delegated_chamber_id);
      if (row.delegated_agent_id) ids.add(row.delegated_agent_id);
    }

    const registryMap = new Map<string, RegistryRow>();
    if (ids.size > 0) {
      const { data: registryRows, error: registryError } = await supabase
        .from("entity_registry")
        .select("id, name, entity_type")
        .in("id", Array.from(ids));
      if (registryError) {
        return NextResponse.json({ error: registryError.message }, { status: 500 });
      }
      for (const row of (registryRows ?? []) as RegistryRow[]) {
        registryMap.set(row.id, row);
      }
    }

    const feed: ActivityFeedRow[] = rows.map((row) => ({
      ...row,
      chosen_target_name:
        (row.chosen_target_entity_registry_id &&
          registryMap.get(row.chosen_target_entity_registry_id)?.name) ||
        null,
      delegated_building_name:
        (row.delegated_building_id && registryMap.get(row.delegated_building_id)?.name) || null,
      delegated_chamber_name:
        (row.delegated_chamber_id && registryMap.get(row.delegated_chamber_id)?.name) || null,
      delegated_agent_name:
        (row.delegated_agent_id && registryMap.get(row.delegated_agent_id)?.name) || null,
    }));

    return NextResponse.json({ logs: feed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
