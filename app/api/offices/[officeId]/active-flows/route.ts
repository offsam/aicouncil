import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ officeId: string }> };

const STALE_PENDING_MS = 10 * 60 * 1000;

/** Агенты с незавершённым заданием (pending) — для анимации и подсветки кабелей */
export async function GET(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ activeAgentIds: [], pairs: [] });
  }

  const { officeId } = await params;
  const staleSince = new Date(Date.now() - STALE_PENDING_MS).toISOString();

  try {
    const supabase = getSupabaseAdmin();
    const { data: pendingLogs, error } = await supabase
      .from("request_logs")
      .select("agent_id")
      .eq("office_id", officeId)
      .eq("status", "pending")
      .not("agent_id", "is", null)
      .gte("created_at", staleSince);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const activeAgentIds = [
      ...new Set((pendingLogs ?? []).map((l) => l.agent_id as string).filter(Boolean)),
    ];

    const { data: connections } = await supabase
      .from("office_connections")
      .select("from_agent_id, to_agent_id")
      .eq("office_id", officeId);

    const pairs = (connections ?? [])
      .filter(
        (c) =>
          activeAgentIds.includes(c.from_agent_id) ||
          activeAgentIds.includes(c.to_agent_id),
      )
      .map((c) => ({ from: c.from_agent_id, to: c.to_agent_id }));

    return NextResponse.json({ activeAgentIds, pairs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
