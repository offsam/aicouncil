import { NextResponse } from "next/server";
import { ensureAgentRegistry } from "@/lib/entity-registry-ensure";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Batch fetch all agent_assignments grouped by chamber_id (replaces N+1 per-chamber calls).
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_assignments")
      .select("id, agent_id, chamber_id, role, layout_x, layout_y, layout_size, created_at, agents(id, name, office_id, provider, model_id, status, cost_tier, color, created_at), chambers(entity_registry_id)")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const row of data ?? []) {
      const rawAgent = row.agents as
        | { id: string; name: string; office_id: string | null }
        | { id: string; name: string; office_id: string | null }[]
        | null;
      const agent = Array.isArray(rawAgent) ? rawAgent[0] : rawAgent;
      const rawChamber = row.chambers as
        | { entity_registry_id: string }
        | { entity_registry_id: string }[]
        | null;
      const chamber = Array.isArray(rawChamber) ? rawChamber[0] : rawChamber;
      if (agent) {
        await ensureAgentRegistry(supabase, agent, chamber?.entity_registry_id);
      }
    }

    const assignmentsByChamber: Record<string, typeof data> = {};
    for (const row of data ?? []) {
      const key = row.chamber_id;
      if (!assignmentsByChamber[key]) assignmentsByChamber[key] = [];
      assignmentsByChamber[key].push(row);
    }

    return NextResponse.json({ assignmentsByChamber });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
