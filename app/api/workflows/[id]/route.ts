import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { executeWorkflow } from "@/lib/workflow-executor";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { data: workflow, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !workflow) {
      return NextResponse.json({ error: "Workflow не найден" }, { status: 404 });
    }

    const { data: steps } = await supabase
      .from("workflow_steps")
      .select(
        "*, target_chamber:entity_registry!target_chamber_entity_id(id, name, entity_type), assigned_agent:agents(id, name)",
      )
      .eq("workflow_id", id)
      .order("step_order", { ascending: true });

    return NextResponse.json({ workflow, steps: steps ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { id } = await params;

  try {
    await executeWorkflow(id);
    const supabase = getSupabaseAdmin();
    const { data: workflow } = await supabase.from("workflows").select("*").eq("id", id).single();
    const { data: steps } = await supabase
      .from("workflow_steps")
      .select("*")
      .eq("workflow_id", id)
      .order("step_order", { ascending: true });

    return NextResponse.json({ workflow, steps: steps ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { id } = await params;

  try {
    const body = (await request.json()) as { outcome?: string; outcome_reason?: string };
    const outcome = body.outcome;

    if (outcome !== "good" && outcome !== "bad") {
      return NextResponse.json({ error: "outcome must be 'good' or 'bad'" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const patch: { outcome: string; outcome_reason?: string | null } = { outcome };
    if (outcome === "bad" && body.outcome_reason?.trim()) {
      patch.outcome_reason = body.outcome_reason.trim();
    }

    const { data: workflow, error } = await supabase
      .from("workflows")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !workflow) {
      return NextResponse.json({ error: error?.message || "Workflow не найден" }, { status: 404 });
    }

    return NextResponse.json({ workflow });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
