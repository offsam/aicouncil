import { NextRequest, NextResponse } from "next/server";
import { withComputedStatus } from "@/lib/agent-status";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { AgentStats, LogStatus } from "@/lib/office-types";

type RouteParams = { params: Promise<{ officeId: string; agentId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId, agentId } = await params;

  try {
    const body = (await request.json()) as { color?: string | null };
    if (body.color === undefined) {
      return NextResponse.json({ error: "color обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, office_id")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "Агент не найден" }, { status: 404 });
    }

    let inOffice = agent.office_id === officeId;
    if (!inOffice) {
      const { data: buildings } = await supabase
        .from("office_objects")
        .select("id")
        .eq("office_id", officeId)
        .eq("object_type", "room");
      const buildingIds = (buildings ?? []).map((b) => b.id);
      if (buildingIds.length > 0) {
        const { data: chambers } = await supabase
          .from("chambers")
          .select("id")
          .in("building_object_id", buildingIds);
        const chamberIds = (chambers ?? []).map((c) => c.id);
        if (chamberIds.length > 0) {
          const { count } = await supabase
            .from("agent_assignments")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", agentId)
            .in("chamber_id", chamberIds);
          inOffice = (count ?? 0) > 0;
        }
      }
    }

    if (!inOffice) {
      return NextResponse.json({ error: "Агент не найден в этом офисе" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("agents")
      .update({ color: body.color })
      .eq("id", agentId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agent: withComputedStatus(data) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId, agentId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: desk, error: deskError } = await supabase
      .from("office_objects")
      .select("id")
      .eq("office_id", officeId)
      .eq("agent_id", agentId)
      .eq("object_type", "desk")
      .maybeSingle();

    if (deskError) {
      return NextResponse.json({ error: deskError.message }, { status: 500 });
    }

    if (!desk) {
      return NextResponse.json(
        { error: "Агент не найден в этом офисе" },
        { status: 404 },
      );
    }

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "Агент не найден" }, { status: 404 });
    }

    const { data: logs, error: logsError } = await supabase
      .from("request_logs")
      .select("*")
      .eq("office_id", officeId)
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (logsError) {
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    const { data: allLogs, error: statsError } = await supabase
      .from("request_logs")
      .select("status")
      .eq("office_id", officeId)
      .eq("agent_id", agentId);

    if (statsError) {
      return NextResponse.json({ error: statsError.message }, { status: 500 });
    }

    const stats: AgentStats = { total: 0, success: 0, error: 0 };
    for (const row of allLogs ?? []) {
      stats.total += 1;
      const status = row.status as LogStatus;
      if (status === "success") stats.success += 1;
      if (status === "error") stats.error += 1;
    }

    return NextResponse.json({
      agent: withComputedStatus(agent),
      stats,
      recentLogs: logs ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
