import { NextRequest, NextResponse } from "next/server";
import { clearChamberManagerIfAgent } from "@/lib/chamber-manager";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ chamberId: string; assignmentId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { chamberId, assignmentId } = await params;

  try {
    const body = (await request.json()) as {
      layout_x?: number;
      layout_y?: number;
      layout_size?: number;
      role?: string | null;
    };

    const patch: Record<string, unknown> = {};
    if (body.layout_x !== undefined) patch.layout_x = body.layout_x;
    if (body.layout_y !== undefined) patch.layout_y = body.layout_y;
    if (body.layout_size !== undefined) patch.layout_size = body.layout_size;
    if (body.role !== undefined) patch.role = body.role;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_assignments")
      .update(patch)
      .eq("id", assignmentId)
      .eq("chamber_id", chamberId)
      .select(
        "id, agent_id, chamber_id, role, layout_x, layout_y, layout_size, created_at, agents(id, name, office_id, provider, model_id, status, cost_tier, created_at)",
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { chamberId, assignmentId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from("agent_assignments")
      .select("agent_id")
      .eq("id", assignmentId)
      .eq("chamber_id", chamberId)
      .maybeSingle();

    const { error } = await supabase
      .from("agent_assignments")
      .delete()
      .eq("id", assignmentId)
      .eq("chamber_id", chamberId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (existing?.agent_id) {
      await clearChamberManagerIfAgent(chamberId, existing.agent_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
