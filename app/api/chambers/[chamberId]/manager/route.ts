import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ chamberId: string }> };

/** Set or clear chamber lead (chambers.manager_agent_id). */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { chamberId } = await params;

  try {
    const body = (await request.json()) as { manager_agent_id?: string | null };
    if (!("manager_agent_id" in body)) {
      return NextResponse.json({ error: "manager_agent_id обязателен" }, { status: 400 });
    }

    const managerAgentId = body.manager_agent_id?.trim() || null;
    const supabase = getSupabaseAdmin();

    const { data: chamber, error: chamberError } = await supabase
      .from("chambers")
      .select("id, manager_agent_id")
      .eq("id", chamberId)
      .maybeSingle();

    if (chamberError || !chamber) {
      return NextResponse.json({ error: "Отдел не найден" }, { status: 404 });
    }

    if (managerAgentId) {
      const { data: assignment } = await supabase
        .from("agent_assignments")
        .select("id")
        .eq("chamber_id", chamberId)
        .eq("agent_id", managerAgentId)
        .maybeSingle();

      if (!assignment) {
        return NextResponse.json(
          { error: "Руководителем можно назначить только агента из этого отдела" },
          { status: 400 },
        );
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("chambers")
      .update({ manager_agent_id: managerAgentId })
      .eq("id", chamberId)
      .select("id, manager_agent_id, entity_registry_id")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ chamber: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
