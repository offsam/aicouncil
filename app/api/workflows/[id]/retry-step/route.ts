import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { retryWorkflowStep } from "@/lib/workflow-executor";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { id } = await params;

  try {
    const body = (await request.json()) as { stepId?: string };
    if (!body.stepId?.trim()) {
      return NextResponse.json({ error: "stepId обязателен" }, { status: 400 });
    }

    await retryWorkflowStep(id, body.stepId.trim());

    const supabase = getSupabaseAdmin();
    const { data: workflow } = await supabase.from("workflows").select("*").eq("id", id).single();
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
