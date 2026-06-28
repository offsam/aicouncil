import { NextRequest, NextResponse } from "next/server";
import { ensureAgentRegistry } from "@/lib/entity-registry-ensure";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ chamberId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { chamberId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: chamber } = await supabase
      .from("chambers")
      .select("manager_agent_id")
      .eq("id", chamberId)
      .maybeSingle();

    const { data, error } = await supabase
      .from("agent_assignments")
      .select("id, agent_id, chamber_id, role, layout_x, layout_y, layout_size, created_at, agents(id, name, office_id, provider, model_id, status, cost_tier, created_at)")
      .eq("chamber_id", chamberId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      assignments: data ?? [],
      manager_agent_id: chamber?.manager_agent_id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { chamberId } = await params;

  try {
    const body = (await request.json()) as { agent_id?: string; role?: string | null };
    const { agent_id, role } = body;

    if (!agent_id) {
      return NextResponse.json({ error: "agent_id обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: chamber, error: chamberError } = await supabase
      .from("chambers")
      .select("entity_registry_id")
      .eq("id", chamberId)
      .single();

    if (chamberError || !chamber) {
      return NextResponse.json({ error: "Chamber не найден" }, { status: 404 });
    }

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, name, office_id")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "Agent не найден" }, { status: 404 });
    }

    await ensureAgentRegistry(supabase, agent, chamber.entity_registry_id);

    const { data, error } = await supabase
      .from("agent_assignments")
      .insert({
        agent_id,
        chamber_id: chamberId,
        role: role ?? null,
      })
      .select("id, agent_id, chamber_id, role, layout_x, layout_y, layout_size, created_at, agents(id, name, office_id, provider, model_id, status, cost_tier, created_at)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
