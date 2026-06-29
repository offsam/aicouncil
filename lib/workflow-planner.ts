import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import { resolveRoute } from "./routing";
import { invokeCheapLLM } from "./cheap-llm";
import type { PlanWorkflowResult, WorkflowPlan, WorkflowPlanStep } from "./office-types";
import type { RouteDecision } from "./office-types";

type ChamberOption = {
  id: string;
  name: string;
  routing_description: string | null;
};

/** Signal B: heuristic multi-step markers without LLM. */
export function detectMultiStepHeuristic(taskText: string): boolean {
  const t = taskText.trim();
  const lower = t.toLowerCase();

  if (/(сначала[\s\S]+потом|потом\s+нужно|затем\s+|after that|first[\s\S]+then|step\s+\d)/i.test(lower)) {
    return true;
  }

  const actionVerbs =
    lower.match(
      /\b(сделай|создай|напиши|разработай|проверь|сверстай|запусти|create|build|write|review|design|develop|launch|approve)\b/g,
    ) ?? [];
  if (actionVerbs.length >= 2) return true;

  return false;
}

async function fetchChamberOptions(): Promise<ChamberOption[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("entity_registry")
    .select("id, name, routing_description")
    .eq("entity_type", "chamber")
    .order("name");

  if (error) throw new Error(error.message);
  return (data ?? []) as ChamberOption[];
}

export function parseWorkflowPlanResponse(
  text: string,
  validChamberIds: string[],
): WorkflowPlan | null {
  try {
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      needsWorkflow?: boolean;
      steps?: Array<{ targetChamberEntityId?: string; reason?: string }>;
    };

    if (!parsed.needsWorkflow) {
      return { needsWorkflow: false, steps: [] };
    }

    const steps: WorkflowPlanStep[] = [];
    for (const step of parsed.steps ?? []) {
      if (typeof step.targetChamberEntityId !== "string") continue;
      if (!validChamberIds.includes(step.targetChamberEntityId)) {
        return null;
      }
      steps.push({
        targetChamberEntityId: step.targetChamberEntityId,
        reason: typeof step.reason === "string" ? step.reason : "Planner step",
      });
    }

    return { needsWorkflow: true, steps };
  } catch {
    return null;
  }
}

/** Reject degenerate plans: needsWorkflow with < 2 steps → treat as no workflow. */
export function normalizeWorkflowPlan(plan: WorkflowPlan): WorkflowPlan {
  if (!plan.needsWorkflow || plan.steps.length < 2) {
    return { needsWorkflow: false, steps: [] };
  }
  return plan;
}

/**
 * WorkflowPlanner — decides if task needs a multi-chamber chain and builds step order.
 * Does NOT modify resolveRoute; calls it for signal A only.
 */
export async function planWorkflow(
  taskText: string,
  sourceEntityId?: string,
  options?: { skipChamberList?: boolean; officeId?: string },
): Promise<PlanWorkflowResult> {
  if (!isSupabaseConfigured()) {
    const empty: RouteDecision = {
      targets: [],
      method: "rule-based",
      agentCount: 1,
    };
    return { plan: { needsWorkflow: false, steps: [] }, routeDecision: empty };
  }

  const routeDecision = await resolveRoute(taskText, undefined, sourceEntityId, options?.officeId);
  const signalA = routeDecision.targets.length > 1;
  const signalB = detectMultiStepHeuristic(taskText);

  if (!signalA && !signalB) {
    return { plan: { needsWorkflow: false, steps: [] }, routeDecision };
  }

  const chambers = options?.skipChamberList ? [] : await fetchChamberOptions();
  const validIds = chambers.map((c) => c.id);

  if (validIds.length < 2) {
    return { plan: { needsWorkflow: false, steps: [] }, routeDecision };
  }

  const chamberList = chambers
    .map(
      (c) =>
        `- ID: ${c.id}, Name: ${c.name}, Description: ${c.routing_description || "No description"}`,
    )
    .join("\n");

  const prompt = `You are a workflow planner for a municipal office simulation. Decide if the user's task must be handled SEQUENTIALLY by multiple departments (chambers), in order.

Available departments (choose ONLY from this list — do not invent departments):
${chamberList}

User task: "${taskText}"

Routing already found these relevant targets (for context): ${routeDecision.targets.map((t) => `${t.entityRegistryId} (${t.reason})`).join("; ") || "none"}

Respond ONLY with JSON:
{
  "needsWorkflow": true,
  "steps": [
    { "targetChamberEntityId": "uuid-from-list-above", "reason": "why this step runs at this position" }
  ]
}

If the task can be handled by a single department, respond: { "needsWorkflow": false, "steps": [] }
If multi-step, provide at least 2 steps in execution order. Use exact UUIDs from the list.`;

  try {
    const raw = await invokeCheapLLM({
      purpose: "workflow-planner",
      prompt,
      responseFormat: "json",
      officeId: options?.officeId,
    });
    const parsed = parseWorkflowPlanResponse(raw, validIds);
    if (!parsed) {
      return { plan: { needsWorkflow: false, steps: [] }, routeDecision };
    }
    return { plan: normalizeWorkflowPlan(parsed), routeDecision };
  } catch (err) {
    console.warn("Workflow planner LLM failed:", err);
    return { plan: { needsWorkflow: false, steps: [] }, routeDecision };
  }
}
