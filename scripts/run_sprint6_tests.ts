/**
 * Sprint 6 tests — Feedback & Evaluation Layer
 * Run: npx tsx scripts/run_sprint6_tests.ts
 */
import * as fs from "fs";
import pg from "pg";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import { resolveRoute } from "../lib/routing";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const ref =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
const password = process.env.SUPABASE_DB_PASSWORD;

let pgClient: pg.Client;

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const res = await pgClient.query(query, params);
  return res.rows as T[];
}

async function test1_singleRoutingFeedback() {
  console.log("\n=== TEST 1: Single route → outcome good in routing_logs ===");
  const decision = await resolveRoute("What is the capital of France?");
  if (!decision.routingLogId) {
    throw new Error("routingLogId missing from RouteDecision");
  }

  const supabase = getSupabaseAdmin();
  await supabase.from("routing_logs").update({ outcome: "good" }).eq("id", decision.routingLogId);

  const rows = await sql<{ outcome: string }>(
    "SELECT outcome FROM routing_logs WHERE id = $1",
    [decision.routingLogId],
  );
  if (rows[0]?.outcome !== "good") {
    throw new Error(`Expected good, got ${rows[0]?.outcome}`);
  }
  console.log("TEST 1 PASS — log", decision.routingLogId);
  return decision.routingLogId;
}

async function test2_workflowFeedback() {
  console.log("\n=== TEST 2: Workflow → bad + outcome_reason, steps unchanged ===");
  const supabase = getSupabaseAdmin();

  const { data: completed } = await supabase
    .from("workflows")
    .select("id")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!completed) throw new Error("No completed workflow for test");

  const reason = "ответ слишком общий";
  await supabase
    .from("workflows")
    .update({ outcome: "bad", outcome_reason: reason })
    .eq("id", completed.id);

  const wf = await sql<{ outcome: string; outcome_reason: string }>(
    "SELECT outcome, outcome_reason FROM workflows WHERE id = $1",
    [completed.id],
  );
  if (wf[0]?.outcome !== "bad" || wf[0]?.outcome_reason !== reason) {
    throw new Error("Workflow outcome not saved");
  }

  const stepOutcomeCol = await sql<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'workflow_steps' AND column_name = 'outcome'",
  );
  if (stepOutcomeCol.length > 0) {
    throw new Error("workflow_steps should not have outcome column");
  }

  console.log("TEST 2 PASS — workflow", completed.id);
  return completed.id;
}

async function test3_unratedDefault() {
  console.log("\n=== TEST 3: New logs default to unrated ===");
  const decision = await resolveRoute("unrated check query sprint6");
  const rows = await sql<{ outcome: string }>(
    "SELECT outcome FROM routing_logs WHERE id = $1",
    [decision.routingLogId],
  );
  if (rows[0]?.outcome !== "unrated") {
    throw new Error(`Expected unrated, got ${rows[0]?.outcome}`);
  }
  console.log("TEST 3 PASS");
}

async function test4_routingOutcomesSummary() {
  console.log("\n=== TEST 4: routing_outcomes_summary aggregation ===");
  const rows = await sql<{
    chosen_target_entity_registry_id: string;
    total: string;
    good_count: string;
    bad_count: string;
    unrated_count: string;
  }>("SELECT * FROM routing_outcomes_summary ORDER BY total DESC LIMIT 10");

  console.log(JSON.stringify(rows, null, 2));
  if (!rows.length) throw new Error("Summary view returned no rows");

  const hasGood = rows.some((r) => Number(r.good_count) >= 1);
  const hasUnrated = rows.some((r) => Number(r.unrated_count) >= 1);
  if (!hasGood || !hasUnrated) {
    throw new Error("Summary should include good and unrated counts from tests");
  }
  console.log("TEST 4 PASS");
}

async function test5_routingScoreDetail() {
  console.log("\n=== TEST 5: RoutingScoreDetail on rule match ===");
  const supabase = getSupabaseAdmin();
  const RUN = `s6_${Date.now()}`;

  const { data: chamber } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("entity_type", "chamber")
    .neq("id", "c0000000-0000-4000-8000-000000000000")
    .limit(1)
    .single();

  if (!chamber) throw new Error("No chamber for rule test");

  const keyword = `sprint6kw_${RUN}`;
  const { data: rule } = await supabase
    .from("routing_rules")
    .insert({
      condition_type: "keyword",
      condition_value: keyword,
      target_entity_registry_id: chamber.id,
      priority: 10,
    })
    .select("id")
    .single();

  const decision = await resolveRoute(`Please handle ${keyword} request`);
  await supabase.from("routing_rules").delete().eq("id", rule!.id);

  if (!decision.scoreDetail) {
    throw new Error("scoreDetail missing");
  }
  if (decision.scoreDetail.matchedRules.length === 0) {
    throw new Error("matchedRules empty — expected rule match");
  }
  if (!decision.scoreDetail.matchedKeywords.includes(keyword)) {
    throw new Error(`matchedKeywords missing ${keyword}: ${JSON.stringify(decision.scoreDetail)}`);
  }
  if (decision.method !== "rule-based") {
    throw new Error(`Expected rule-based, got ${decision.method}`);
  }

  console.log("scoreDetail:", JSON.stringify(decision.scoreDetail, null, 2));
  console.log("TEST 5 PASS");
}

async function main() {
  if (!ref || !password) {
    console.error("SUPABASE_DB_PASSWORD required");
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

  const col = await sql(
    "SELECT column_name FROM information_schema.columns WHERE table_name='routing_logs' AND column_name='outcome'",
  );
  if (!col.length) {
    console.error("Run: npx tsx scripts/apply_sprint6_pg.ts");
    process.exit(1);
  }

  await test1_singleRoutingFeedback();
  await test2_workflowFeedback();
  await test3_unratedDefault();
  await test4_routingOutcomesSummary();
  await test5_routingScoreDetail();

  await pgClient.end();
  console.log("\n✅ All Sprint 6 tests passed");
}

main().catch((e) => {
  console.error("\n❌ Sprint 6 tests failed:", e);
  process.exit(1);
});
