import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import { planWorkflow } from "./workflow-planner";
import { executeWorkflow } from "./workflow-executor";
import type { RouteDecision, WorkflowPlan } from "./office-types";

export type ProcessTaskResult =
  | {
      mode: "single";
      decision: RouteDecision;
    }
  | {
      mode: "workflow";
      workflowId: string;
    };

/**
 * Single entry: plan → create workflow + steps → execute, OR fall back to resolveRoute only.
 */
export async function processTask(
  taskText: string,
  sourceEntityId?: string,
): Promise<ProcessTaskResult> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase не настроен");
  }

  const { plan, routeDecision } = await planWorkflow(taskText, sourceEntityId);

  if (!plan.needsWorkflow || plan.steps.length < 2) {
    return { mode: "single", decision: routeDecision };
  }

  const workflowId = await createWorkflowAndExecute(taskText, plan);
  return { mode: "workflow", workflowId };
}

export async function createWorkflowAndExecute(
  taskText: string,
  plan: WorkflowPlan,
): Promise<string> {
  if (plan.steps.length < 2) {
    throw new Error("Workflow plan must have at least 2 steps");
  }

  const supabase = getSupabaseAdmin();

  const { data: workflow, error: wfError } = await supabase
    .from("workflows")
    .insert({ task_text: taskText, status: "pending" })
    .select("id")
    .single();

  if (wfError || !workflow) {
    throw new Error(wfError?.message || "Failed to create workflow");
  }

  const stepRows = plan.steps.map((step, index) => ({
    workflow_id: workflow.id,
    step_order: index + 1,
    target_chamber_entity_id: step.targetChamberEntityId,
    status: "pending" as const,
    input_summary: step.reason,
  }));

  const { error: stepsError } = await supabase.from("workflow_steps").insert(stepRows);
  if (stepsError) {
    await supabase.from("workflows").delete().eq("id", workflow.id);
    throw new Error(stepsError.message);
  }

  await supabase.from("workflows").update({ status: "in_progress" }).eq("id", workflow.id);

  await executeWorkflow(workflow.id);

  return workflow.id;
}
