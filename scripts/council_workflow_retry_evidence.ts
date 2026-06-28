/**
 * Evidence: Council soft degradation + workflow step retry.
 * Run: npx tsx scripts/council_workflow_retry_evidence.ts
 */
import * as fs from "fs";
import * as path from "path";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import { executeChatTask } from "../lib/execute-chat-task";
import { createWorkflowAndExecute } from "../lib/workflow-orchestrator";
import {
  FORCE_FAIL_PREFIX,
  retryWorkflowStep,
} from "../lib/workflow-executor";

import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const INSTAGRAM_REGISTRY = "39d9aa14-6eb3-4359-bd21-ee9a148d62b8";
const COUNCIL_AGENT_IDS = [
  "a1000003-0000-4000-8000-000000000003",
  "a1000006-0000-4000-8000-000000000006",
  "a1000007-0000-4000-8000-000000000007",
];

async function ensureInstagramRoster(): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: chamber } = await supabase
    .from("chambers")
    .select("id")
    .eq("entity_registry_id", INSTAGRAM_REGISTRY)
    .maybeSingle();
  if (!chamber?.id) throw new Error("Instagram chamber not found");

  await supabase.from("agent_assignments").delete().eq("chamber_id", chamber.id);
  for (const agentId of COUNCIL_AGENT_IDS) {
    const { error } = await supabase.from("agent_assignments").insert({
      chamber_id: chamber.id,
      agent_id: agentId,
    });
    if (error) throw new Error(`assignment insert: ${error.message}`);
  }
}

const OUT = path.join(process.cwd(), "docs/evidence/council-workflow-retry");
fs.mkdirSync(OUT, { recursive: true });

async function councilPartialOneSuccess() {
  const data = await executeChatTask(
    `Council partial 1-of-3 ${Date.now()}`,
    INSTAGRAM_REGISTRY,
    "council",
    { forceFailSlugs: ["or-llama", "or-qwen"] },
  );
  fs.writeFileSync(
    path.join(OUT, "council-1-success.json"),
    JSON.stringify(data, null, 2),
  );
  if (data.mode !== "single" || !data.council) {
    throw new Error("Expected council single mode result");
  }
  return {
    ok: true,
    successCount: data.council.successCount,
    invokedCount: data.council.invokedCount,
    hasReport: Boolean(data.council.report),
    answerPrefix: String(data.answer ?? "").slice(0, 120),
    partial: data.council.partial,
  };
}

async function councilPartialTwoSuccess() {
  const data = await executeChatTask(
    `Council partial 2-of-3 ${Date.now()}`,
    INSTAGRAM_REGISTRY,
    "council",
    { forceFailSlugs: ["or-llama"] },
  );
  fs.writeFileSync(
    path.join(OUT, "council-2-success.json"),
    JSON.stringify(data, null, 2),
  );
  if (data.mode !== "single" || !data.council) {
    throw new Error("Expected council single mode result");
  }
  const report = data.council.report;
  return {
    ok: true,
    successCount: data.council.successCount,
    invokedCount: data.council.invokedCount,
    hasReport: Boolean(report),
    reportBlocks: report
      ? {
          consensus: Boolean(report.consensus),
          differences: Boolean(report.differences),
          bestAnswer: Boolean(report.bestAnswer),
          finalVerdict: Boolean(report.finalVerdict),
        }
      : null,
    answerHasWarning: String(data.answer ?? "").includes("Не все эксперты ответили"),
    partial: data.council.partial,
  };
}

async function workflowRetryStep() {
  const supabase = getSupabaseAdmin();
  const { data: chambers } = await supabase
    .from("entity_registry")
    .select("id, name")
    .eq("entity_type", "chamber")
    .order("name")
    .limit(2);

  if (!chambers || chambers.length < 2) {
    throw new Error("Need 2 chambers");
  }

  const plan = {
    needsWorkflow: true,
    steps: [
      { targetChamberEntityId: chambers[0].id, reason: "retry test step 1" },
      { targetChamberEntityId: chambers[1].id, reason: "retry test step 2" },
    ],
  };

  const workflowId = await createWorkflowAndExecute(
    `${FORCE_FAIL_PREFIX} retry evidence ${Date.now()}`,
    plan,
  );

  const { data: stepsBefore } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("step_order");

  const { data: wfBefore } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  const failedStep = stepsBefore?.[0];
  if (wfBefore?.status !== "failed" || failedStep?.status !== "failed") {
    throw new Error("Expected step 1 failed");
  }

  // Remove forced-fail prefix so retry can succeed
  await supabase
    .from("workflows")
    .update({ task_text: `Retry evidence success ${Date.now()}` })
    .eq("id", workflowId);

  await retryWorkflowStep(workflowId, failedStep.id);

  const { data: wfAfter } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();
  const { data: stepsAfter } = await supabase
    .from("workflow_steps")
    .select("step_order, status, error_message")
    .eq("workflow_id", workflowId)
    .order("step_order");

  const result = {
    workflowId,
    before: {
      workflowStatus: wfBefore.status,
      step1: stepsBefore?.[0]?.status,
      step2: stepsBefore?.[1]?.status,
      error: failedStep.error_message,
    },
    after: {
      workflowStatus: wfAfter?.status,
      steps: stepsAfter,
    },
    step1Completed: stepsAfter?.[0]?.status === "completed",
    step2Ran: stepsAfter?.[1]?.status !== "pending" || wfAfter?.status === "completed",
    workflowCompleted: wfAfter?.status === "completed",
  };

  fs.writeFileSync(path.join(OUT, "workflow-retry.json"), JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  await ensureInstagramRoster();
  const report = {
    generatedAt: new Date().toISOString(),
    council_one_success: await councilPartialOneSuccess(),
    council_two_success: await councilPartialTwoSuccess(),
    workflow_retry: await workflowRetryStep(),
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
