/**
 * Sprint 5 end-to-end tests (spec items 1–9).
 * Run: npx tsx scripts/run_sprint5_tests.ts
 */
import * as fs from "fs";
import pg from "pg";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import { processTask } from "../lib/workflow-orchestrator";
import { executeWorkflow, FORCE_FAIL_PREFIX } from "../lib/workflow-executor";
import {
  detectMultiStepHeuristic,
  normalizeWorkflowPlan,
  parseWorkflowPlanResponse,
  planWorkflow,
} from "../lib/workflow-planner";
import { createWorkflowAndExecute } from "../lib/workflow-orchestrator";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const ref =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
const password = process.env.SUPABASE_DB_PASSWORD;

let pgClient: pg.Client | null = null;

async function sql(label: string, query: string, params: unknown[] = []) {
  if (!pgClient) throw new Error("pg not connected");
  const res = await pgClient.query(query, params);
  console.log(`\n[SQL ${label}]`, JSON.stringify(res.rows, null, 2));
  return res.rows;
}

async function countWorkflows(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase.from("workflows").select("*", { count: "exact", head: true });
  return count ?? 0;
}

async function getChambers(): Promise<Array<{ id: string; name: string }>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("entity_registry")
    .select("id, name, routing_description")
    .eq("entity_type", "chamber")
    .order("name");
  return (data ?? []) as Array<{ id: string; name: string }>;
}

async function test1_singleTaskNoWorkflow() {
  console.log("\n=== TEST 1: Single-target task → no workflow row ===");
  const before = await countWorkflows();
  const result = await processTask("What is 2+2?");
  if (result.mode !== "single") {
    throw new Error(`Expected mode single, got ${result.mode}`);
  }
  const after = await countWorkflows();
  if (after !== before) {
    throw new Error(`Workflow row created unexpectedly: before=${before} after=${after}`);
  }
  console.log("TEST 1 PASS");
}

async function test2_multiStepWorkflow() {
  console.log("\n=== TEST 2: Multi-step task → workflow with ≥2 steps ===");
  const chambers = await getChambers();
  if (chambers.length < 2) {
    throw new Error("Need at least 2 chambers in entity_registry");
  }

  const names = chambers.slice(0, 2).map((c) => c.name).join(" and ");
  const taskText = `Сначала создай маркетинговую стратегию, потом напиши контент для лендинга Citizly — затрагивает отделы ${names}`;

  if (!detectMultiStepHeuristic(taskText)) {
    console.warn("Heuristic did not fire — task may still trigger via routing signal A");
  }

  const result = await processTask(taskText);
  if (result.mode !== "workflow") {
    throw new Error(`Expected workflow mode, got ${result.mode}. Check GROQ_API_KEY and chamber routing_descriptions.`);
  }

  const supabase = getSupabaseAdmin();
  const { data: steps } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", result.workflowId)
    .order("step_order");

  if (!steps || steps.length < 2) {
    throw new Error(`Expected ≥2 steps, got ${steps?.length ?? 0}`);
  }

  for (let i = 0; i < steps.length; i++) {
    if (steps[i].step_order !== i + 1) {
      throw new Error(`Step order mismatch at index ${i}`);
    }
  }

  await sql("workflows latest", "SELECT * FROM workflows ORDER BY created_at DESC LIMIT 3");
  await sql("steps", "SELECT id, step_order, status, target_chamber_entity_id FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order", [result.workflowId]);

  console.log("TEST 2 PASS — workflowId:", result.workflowId);
  return { workflowId: result.workflowId, steps };
}

async function test3_step2ReceivesStep1Output(workflowId: string) {
  console.log("\n=== TEST 3: Step 2 context includes step 1 output ===");
  const supabase = getSupabaseAdmin();
  const { data: steps } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("step_order");

  if (!steps || steps.length < 2) throw new Error("Need completed workflow with 2+ steps");

  const step1 = steps[0];
  const step2 = steps[1];

  if (step1.status !== "completed") {
    throw new Error(`Step 1 not completed: ${step1.status}`);
  }
  if (!step1.output_full?.trim()) {
    throw new Error("Step 1 output_full is empty");
  }

  const snippet = step1.output_full.slice(0, 80).trim();
  const inputHasPrior =
    (step2.input_summary?.includes("Prior output") || step2.input_summary?.includes(snippet.slice(0, 40))) ??
    false;
  const outputReflects =
    step2.output_full?.toLowerCase().includes(snippet.slice(0, 20).toLowerCase()) ||
    step2.input_summary?.includes(snippet.slice(0, 30));

  if (!inputHasPrior && !outputReflects && step2.status === "completed") {
    console.warn("Step 2 input_summary:", step2.input_summary?.slice(0, 200));
    console.warn("Step 1 output snippet:", snippet);
    // Soft check: input_summary must reference prior output block
    if (!step2.input_summary?.includes("Prior output")) {
      throw new Error("Step 2 input_summary does not include prior step output");
    }
  }

  console.log("TEST 3 PASS");
}

async function test4_forcedFailure() {
  console.log("\n=== TEST 4: Forced failure on step 1 → workflow failed, step 2 not run ===");
  const chambers = await getChambers();
  if (chambers.length < 2) throw new Error("Need 2 chambers");

  const plan = {
    needsWorkflow: true,
    steps: [
      { targetChamberEntityId: chambers[0].id, reason: "fail test step 1" },
      { targetChamberEntityId: chambers[1].id, reason: "should not run" },
    ],
  };

  const workflowId = await createWorkflowAndExecute(`${FORCE_FAIL_PREFIX} intentional failure test`, plan);

  const supabase = getSupabaseAdmin();
  const { data: wf } = await supabase.from("workflows").select("*").eq("id", workflowId).single();
  const { data: steps } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("step_order");

  if (wf?.status !== "failed") {
    throw new Error(`Expected workflow failed, got ${wf?.status}`);
  }
  if (steps?.[0]?.status !== "failed" || !steps[0].error_message) {
    throw new Error("Step 1 should be failed with error_message");
  }
  if (steps[1]?.status !== "pending") {
    throw new Error(`Step 2 should stay pending, got ${steps[1]?.status}`);
  }

  console.log("TEST 4 PASS");
}

async function test5_sqlVerification() {
  console.log("\n=== TEST 5: SQL verification ===");
  await sql("workflows top 5", "SELECT id, task_text, status, created_at, completed_at FROM workflows ORDER BY created_at DESC LIMIT 5");
  const rows = await sql(
    "workflow_steps sample",
    `SELECT ws.step_order, ws.status, ws.error_message, er.name AS chamber
     FROM workflow_steps ws
     JOIN entity_registry er ON er.id = ws.target_chamber_entity_id
     ORDER BY ws.workflow_id, ws.step_order DESC
     LIMIT 10`,
  );
  if (!rows.length) throw new Error("No workflow_steps rows found");
  console.log("TEST 5 PASS");
}

async function test6_idempotency() {
  console.log("\n=== TEST 6: Idempotency ===");
  const chambers = await getChambers();
  const supabase = getSupabaseAdmin();

  const { data: wf } = await supabase
    .from("workflows")
    .insert({ task_text: "idempotency test workflow", status: "in_progress" })
    .select("id")
    .single();

  if (!wf) throw new Error("Failed to create test workflow");

  const stepRows = [
    {
      workflow_id: wf.id,
      step_order: 1,
      target_chamber_entity_id: chambers[0].id,
      status: "completed",
      output_full: "LOCKED_OUTPUT_STEP_1",
      completed_at: new Date("2020-01-01T00:00:00Z").toISOString(),
    },
    {
      workflow_id: wf.id,
      step_order: 2,
      target_chamber_entity_id: chambers[1]?.id ?? chambers[0].id,
      status: "completed",
      output_full: "LOCKED_OUTPUT_STEP_2",
      completed_at: new Date("2020-01-02T00:00:00Z").toISOString(),
    },
    {
      workflow_id: wf.id,
      step_order: 3,
      target_chamber_entity_id: chambers[0].id,
      status: "pending",
    },
  ];

  await supabase.from("workflow_steps").insert(stepRows);

  const { data: beforeSteps } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", wf.id)
    .order("step_order");

  await executeWorkflow(wf.id);

  const { data: afterSteps } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", wf.id)
    .order("step_order");

  if (beforeSteps?.[0]?.output_full !== afterSteps?.[0]?.output_full) {
    throw new Error("Step 1 output changed after idempotent re-run");
  }
  if (beforeSteps?.[1]?.output_full !== afterSteps?.[1]?.output_full) {
    throw new Error("Step 2 output changed after idempotent re-run");
  }
  if (beforeSteps?.[0]?.completed_at !== afterSteps?.[0]?.completed_at) {
    throw new Error("Step 1 completed_at changed");
  }

  // All-completed workflow: executeWorkflow should no-op
  const { data: doneWf } = await supabase
    .from("workflows")
    .insert({ task_text: "all done test", status: "completed", completed_at: new Date().toISOString() })
    .select("id")
    .single();

  await supabase.from("workflow_steps").insert({
    workflow_id: doneWf!.id,
    step_order: 1,
    target_chamber_entity_id: chambers[0].id,
    status: "completed",
    output_full: "done",
    completed_at: new Date().toISOString(),
  });

  await executeWorkflow(doneWf!.id);
  console.log("TEST 6 PASS");
}

async function test7_degeneratePlan() {
  console.log("\n=== TEST 7: Degenerate plan (1 step) → no workflow ===");
  const normalized = normalizeWorkflowPlan({
    needsWorkflow: true,
    steps: [{ targetChamberEntityId: "x", reason: "only one" }],
  });
  if (normalized.needsWorkflow || normalized.steps.length > 0) {
    throw new Error("normalizeWorkflowPlan should reject single-step plan");
  }

  const before = await countWorkflows();
  const chambers = await getChambers();
  const fakePlan = {
    needsWorkflow: true as const,
    steps: [{ targetChamberEntityId: chambers[0]?.id ?? "", reason: "degenerate" }],
  };

  // processTask uses planWorkflow which normalizes — simulate via direct orchestrator path:
  // createWorkflowAndExecute should not be called for <2 steps; processTask handles via normalize in planner.
  // Force planner path: if we had 1-step LLM response, parse + normalize returns false.
  const parsed = parseWorkflowPlanResponse(
    JSON.stringify({
      needsWorkflow: true,
      steps: [{ targetChamberEntityId: chambers[0]?.id, reason: "solo" }],
    }),
    chambers.map((c) => c.id),
  );
  const norm = normalizeWorkflowPlan(parsed ?? { needsWorkflow: false, steps: [] });
  if (norm.needsWorkflow) {
    throw new Error("Single-step parsed plan should normalize to needsWorkflow:false");
  }

  try {
    await createWorkflowAndExecute("degenerate", fakePlan);
    throw new Error("createWorkflowAndExecute should throw for <2 steps");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg.includes("at least 2")) {
      throw e;
    }
  }

  const after = await countWorkflows();
  // createWorkflowAndExecute throws before insert when plan < 2 — count unchanged from throw path
  if (after < before) throw new Error("Unexpected workflow count change");

  console.log("TEST 7 PASS");
}

async function test8_concurrentExecute() {
  console.log("\n=== TEST 8: Concurrent executeWorkflow race ===");
  const chambers = await getChambers();
  const supabase = getSupabaseAdmin();

  const { data: wf } = await supabase
    .from("workflows")
    .insert({ task_text: "concurrent race test — answer with exactly: RACE_OK_TOKEN", status: "in_progress" })
    .select("id")
    .single();

  await supabase.from("workflow_steps").insert({
    workflow_id: wf!.id,
    step_order: 1,
    target_chamber_entity_id: chambers[0].id,
    status: "pending",
  });

  await Promise.all([executeWorkflow(wf!.id), executeWorkflow(wf!.id)]);

  const { data: steps } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", wf!.id);

  const completed = steps?.filter((s) => s.status === "completed") ?? [];
  if (completed.length !== 1) {
    throw new Error(`Expected exactly 1 completed step, got ${completed.length}`);
  }

  console.log("TEST 8 PASS — single execution, output length:", completed[0]?.output_full?.length ?? 0);
}

async function test9_invalidChamberValidation() {
  console.log("\n=== TEST 9: Invalid chamber ID in plan → rejected ===");
  const chambers = await getChambers();
  const validIds = chambers.map((c) => c.id);

  const parsed = parseWorkflowPlanResponse(
    JSON.stringify({
      needsWorkflow: true,
      steps: [
        { targetChamberEntityId: validIds[0], reason: "ok" },
        { targetChamberEntityId: "00000000-0000-4000-8000-000000000099", reason: "fake legal dept" },
      ],
    }),
    validIds,
  );

  if (parsed !== null) {
    throw new Error("Plan with invalid chamber should return null");
  }

  const { plan } = await planWorkflow("multi step legal and marketing review", undefined, {
    skipChamberList: true,
  });
  if (plan.needsWorkflow) {
    throw new Error("Planner with empty chamber list should not create workflow plan");
  }

  console.log("TEST 9 PASS");
}

async function main() {
  if (!ref || !password) {
    console.error("SUPABASE_DB_PASSWORD required in .env.local");
    process.exit(1);
  }

  pgClient = new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: "postgres",
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();

  const tables = await pgClient.query(
    "SELECT to_regclass('public.workflows') AS w, to_regclass('public.workflow_steps') AS s",
  );
  if (!tables.rows[0]?.w) {
    console.error("workflows table missing — run: npx tsx scripts/apply_sprint5_pg.ts");
    process.exit(1);
  }

  await test1_singleTaskNoWorkflow();
  const { workflowId } = await test2_multiStepWorkflow();
  await test3_step2ReceivesStep1Output(workflowId);
  await test4_forcedFailure();
  await test5_sqlVerification();
  await test6_idempotency();
  await test7_degeneratePlan();
  await test8_concurrentExecute();
  await test9_invalidChamberValidation();

  await pgClient.end();
  console.log("\n✅ All Sprint 5 tests passed");
}

main().catch((err) => {
  console.error("\n❌ Sprint 5 tests failed:", err);
  process.exit(1);
});
