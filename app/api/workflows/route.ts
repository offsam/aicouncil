import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { processTask } from "@/lib/workflow-orchestrator";
import { GENERAL_INTAKE_ID, resolveAgentIdsForTarget } from "@/lib/route-agent-ids";
import { requireExternalEntryOfficeId } from "@/lib/workspace/graph-identity-required";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: workflows, error } = await supabase
      .from("workflows")
      .select("id, task_text, status, final_output, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ workflows: workflows ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      taskText?: string;
      question?: string;
      sourceEntityId?: string;
    };

    const taskText = (body.taskText || body.question || "").trim();
    if (!taskText) {
      return NextResponse.json({ error: "taskText обязателен" }, { status: 400 });
    }

    const sourceEntityId = body.sourceEntityId?.trim() || undefined;
    const officeId = await requireExternalEntryOfficeId();
    const result = await processTask(taskText, sourceEntityId, { officeId });

    if (result.mode === "workflow") {
      const supabase = getSupabaseAdmin();
      const { data: workflow } = await supabase
        .from("workflows")
        .select("*")
        .eq("id", result.workflowId)
        .single();

      const { data: steps } = await supabase
        .from("workflow_steps")
        .select(
          "*, target_chamber:entity_registry!target_chamber_entity_id(id, name, entity_type), assigned_agent:agents(id, name)",
        )
        .eq("workflow_id", result.workflowId)
        .order("step_order", { ascending: true });

      return NextResponse.json({
        mode: "workflow",
        workflowId: result.workflowId,
        workflow,
        steps: steps ?? [],
      });
    }

    const chosenTargetId = result.decision.targets[0]?.entityRegistryId || GENERAL_INTAKE_ID;
    const agentIds = await resolveAgentIdsForTarget(chosenTargetId);

    return NextResponse.json({
      mode: "single",
      decision: result.decision,
      agentIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
