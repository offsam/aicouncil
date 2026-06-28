import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import { selectAgentForChamberEntity } from "./agent-selection";
import { invokeAgentForWorkflow, summarizeOutput } from "./invoke-agent";
import type { WorkflowStepRow } from "./office-types";

const FORCE_FAIL_PREFIX = "[WORKFLOW_TEST_FAIL]";

function buildStepQuestion(taskText: string, stepOrder: number, totalSteps: number): string {
  return `Workflow step ${stepOrder} of ${totalSteps}. Original task: ${taskText}\n\nComplete your part of this multi-step task. Be concise but include concrete deliverables for the next step.`;
}

async function claimStep(stepId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("workflow_steps")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", stepId)
    .eq("status", "pending")
    .select("id");

  if (error) throw new Error(error.message);
  return (data?.length ?? 0) === 1;
}

async function loadSteps(workflowId: string): Promise<WorkflowStepRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("step_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as WorkflowStepRow[];
}

/**
 * Workflow Executor — idempotent, sequential, atomic step claim.
 */
export async function executeWorkflow(workflowId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase не настроен");
  }

  const supabase = getSupabaseAdmin();

  const { data: workflow, error: wfErr } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (wfErr || !workflow) {
    throw new Error(wfErr?.message || "Workflow not found");
  }

  if (workflow.status === "completed") return;
  if (workflow.status === "failed") return;

  const steps = await loadSteps(workflowId);
  if (steps.some((s) => s.status === "failed")) return;

  if (steps.every((s) => s.status === "completed")) {
    if (workflow.status !== "completed") {
      const last = steps[steps.length - 1];
      await supabase
        .from("workflows")
        .update({
          status: "completed",
          final_output: last?.output_full ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", workflowId);
    }
    return;
  }

  if (workflow.status === "pending") {
    await supabase.from("workflows").update({ status: "in_progress" }).eq("id", workflowId);
  }

  const totalSteps = steps.length;
  let previousOutput: string | null = null;

  for (const step of steps) {
    if (step.status === "completed") {
      previousOutput = step.output_full;
      continue;
    }
    if (step.status === "failed" || step.status === "skipped") {
      return;
    }
    if (step.status === "in_progress") {
      return;
    }

    const claimed = await claimStep(step.id);
    if (!claimed) {
      return;
    }

    const inputSummary = summarizeOutput(
      `${workflow.task_text}${previousOutput ? `\n\nPrior output: ${previousOutput}` : ""}`,
      400,
    );

    await supabase
      .from("workflow_steps")
      .update({ input_summary: inputSummary })
      .eq("id", step.id);

    try {
      const agent = await selectAgentForChamberEntity(step.target_chamber_entity_id);
      if (!agent) {
        throw new Error(`No agent available for chamber ${step.target_chamber_entity_id}`);
      }

      await supabase
        .from("workflow_steps")
        .update({ assigned_agent_id: agent.agentId })
        .eq("id", step.id);

      const question = buildStepQuestion(workflow.task_text, step.step_order, totalSteps);
      const forceError =
        step.step_order === 1 && workflow.task_text.startsWith(FORCE_FAIL_PREFIX);

      const answer = await invokeAgentForWorkflow({
        agentSlug: agent.slug,
        agentRegistryId: agent.registryId,
        chamberRegistryId: step.target_chamber_entity_id,
        question,
        previousStepOutput: previousOutput,
        forceError,
      });

      const outputSummary = summarizeOutput(answer, 200);
      const completedAt = new Date().toISOString();

      await supabase
        .from("workflow_steps")
        .update({
          status: "completed",
          output_summary: outputSummary,
          output_full: answer,
          completed_at: completedAt,
          error_message: null,
        })
        .eq("id", step.id);

      previousOutput = answer;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Step execution failed";
      await supabase
        .from("workflow_steps")
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", step.id);

      await supabase
        .from("workflows")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", workflowId);
      return;
    }
  }

  const finalSteps = await loadSteps(workflowId);
  const allDone = finalSteps.every((s) => s.status === "completed");
  if (allDone) {
    const last = finalSteps[finalSteps.length - 1];
    await supabase
      .from("workflows")
      .update({
        status: "completed",
        final_output: last.output_full,
        completed_at: new Date().toISOString(),
      })
      .eq("id", workflowId);
  }
}

/**
 * Reset a failed step to pending and resume the workflow from that step.
 */
export async function retryWorkflowStep(workflowId: string, stepId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase не настроен");
  }

  const supabase = getSupabaseAdmin();
  const steps = await loadSteps(workflowId);
  const step = steps.find((s) => s.id === stepId);

  if (!step) {
    throw new Error("Шаг workflow не найден");
  }
  if (step.status !== "failed") {
    throw new Error("Повтор доступен только для шага со статусом failed");
  }

  const { data: workflow, error: wfErr } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (wfErr || !workflow) {
    throw new Error(wfErr?.message || "Workflow not found");
  }
  if (workflow.status === "completed") {
    throw new Error("Workflow уже завершён");
  }

  const { data: resetRows, error: resetErr } = await supabase
    .from("workflow_steps")
    .update({
      status: "pending",
      error_message: null,
      output_summary: null,
      output_full: null,
      started_at: null,
      completed_at: null,
    })
    .eq("id", stepId)
    .eq("status", "failed")
    .select("id");

  if (resetErr) throw new Error(resetErr.message);
  if ((resetRows?.length ?? 0) !== 1) {
    throw new Error("Не удалось сбросить шаг для повтора");
  }

  await supabase
    .from("workflows")
    .update({
      status: "in_progress",
      completed_at: null,
      final_output: null,
    })
    .eq("id", workflowId);

  await executeWorkflow(workflowId);
}

export { FORCE_FAIL_PREFIX };
