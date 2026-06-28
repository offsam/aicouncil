import { NextRequest, NextResponse } from "next/server";
import { withComputedStatus } from "@/lib/agent-status";
import { buildLocalConnectedAgents } from "@/lib/connected-agents";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { AgentRow } from "@/lib/office-types";

export async function GET(request: NextRequest) {
  const officeId = request.nextUrl.searchParams.get("office_id")?.trim();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ agents: buildLocalConnectedAgents() });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: agents, error } = await supabase.from("agents").select("*").order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let placedAgentIds = new Set<string>();
    if (officeId) {
      const { data: desks } = await supabase
        .from("office_objects")
        .select("agent_id")
        .eq("office_id", officeId)
        .eq("object_type", "desk")
        .not("agent_id", "is", null);

      placedAgentIds = new Set(
        (desks ?? []).map((d) => d.agent_id as string).filter(Boolean),
      );
    }

    const connected = (agents ?? [])
      .map((row) => withComputedStatus(row))
      .filter((a) => a.status === "online")
      .filter((a) => !placedAgentIds.has(a.id)) as AgentRow[];

    return NextResponse.json({ agents: connected });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
