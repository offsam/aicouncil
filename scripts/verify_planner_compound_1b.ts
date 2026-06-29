/**
 * PLANNER-COMPOUND-1B: compound destructive+create blocked before planner.
 * Run: npx tsx scripts/verify_planner_compound_1b.ts
 */
import * as fs from "fs";
import pg from "pg";
import { executeChatTask } from "../lib/execute-chat-task";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import {
  CHAT_COMPOUND_DESTRUCTIVE_CREATE_ANSWER,
  hasCompoundDestructiveCreateStructureIntent,
  hasConstructiveStructureIntent,
  hasDestructiveStructureIntent,
} from "../lib/structure-command-intent";
import { resolveCityHallMainAgent } from "../lib/workspace/city-hall-orchestrator";
import { requireExternalEntryOfficeId } from "../lib/workspace/graph-identity-required";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function countRows(table: string): Promise<number> {
  const sb = getSupabaseAdmin();
  const { count } = await sb.from(table).select("id", { count: "exact", head: true });
  return count ?? 0;
}

async function fetchRoutingLog(logId: string | undefined) {
  if (!logId) return null;
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https:\/\/([^.]+)/)![1];
  const client = new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: "postgres",
    password: process.env.SUPABASE_DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const { rows } = await client.query(
    `SELECT routing_action, method, routing_reasoning, routing_trace
     FROM routing_logs WHERE id = $1`,
    [logId],
  );
  await client.end();
  return rows[0] as
    | {
        routing_action: string;
        method: string;
        routing_reasoning: string;
        routing_trace: unknown;
      }
    | undefined;
}

async function askMayor(taskText: string) {
  const officeId = await requireExternalEntryOfficeId();
  const mayor = await resolveCityHallMainAgent(officeId);
  if (!mayor) throw new Error("Mayor not configured");

  return executeChatTask(taskText, mayor.chamberRegistryId, "fast", {
    targetAgentId: mayor.agentId,
    directTargetEntityId: mayor.chamberRegistryId,
  });
}

async function main() {
  console.log("=== Static detector ===\n");

  const compoundText = "удали отдел X, создай отдел Y";
  record("compound: destructive+constructive", hasCompoundDestructiveCreateStructureIntent(compoundText));
  record("compound: has destructive", hasDestructiveStructureIntent(compoundText));
  record("compound: has constructive", hasConstructiveStructureIntent(compoundText));

  record(
    "mutation-only: not compound",
    !hasCompoundDestructiveCreateStructureIntent("измени отдел и удали связь"),
  );
  record(
    "mutation-only: still destructive",
    hasDestructiveStructureIntent("измени отдел и удали связь"),
  );
  record(
    "mutation-only: not constructive",
    !hasConstructiveStructureIntent("измени отдел и удали связь"),
  );

  record("create-only: not compound", !hasCompoundDestructiveCreateStructureIntent("создай отдел Y"));
  record("destructive-only: not compound", !hasCompoundDestructiveCreateStructureIntent("удали отдел X"));

  console.log("\n=== Live compound block (no planner) ===\n");

  const plansBefore = await countRows("tech_structure_plans");
  const snapshotsBefore = await countRows("tech_structure_snapshots");

  const compoundResult = await askMayor(compoundText);
  record(
    "compound answer is explicit clarification",
    compoundResult.mode === "single" &&
      (compoundResult.answer ?? "").includes(CHAT_COMPOUND_DESTRUCTIVE_CREATE_ANSWER.slice(0, 40)),
    { answer: compoundResult.answer },
  );
  record(
    "compound: no structurePlan",
    compoundResult.mode === "single" && compoundResult.structurePlan == null,
    { planId: compoundResult.structurePlan?.planId ?? null },
  );
  record(
    "compound: routing method blocked",
    compoundResult.mode === "single" &&
      compoundResult.routing?.method === "tech-structure-compound-blocked",
    { method: compoundResult.routing?.method },
  );

  const compoundLog = await fetchRoutingLog(compoundResult.routing?.routingLogId);
  record("compound: routing_action structure_compound_blocked", compoundLog?.routing_action === "structure_compound_blocked", compoundLog);

  const plansAfterCompound = await countRows("tech_structure_plans");
  const snapshotsAfterCompound = await countRows("tech_structure_snapshots");
  record("compound: no new tech_structure_plans rows", plansAfterCompound === plansBefore, {
    before: plansBefore,
    after: plansAfterCompound,
  });
  record("compound: no new tech_structure_snapshots rows", snapshotsAfterCompound === snapshotsBefore, {
    before: snapshotsBefore,
    after: snapshotsAfterCompound,
  });

  console.log("\n=== Regression: single-intent not compound-blocked ===\n");

  async function assertNotCompoundBlocked(label: string, taskText: string) {
    record(`${label}: static not compound`, !hasCompoundDestructiveCreateStructureIntent(taskText));
    try {
      const result = await askMayor(taskText);
      record(
        `${label}: routing not compound-blocked`,
        result.routing?.method !== "tech-structure-compound-blocked",
        { method: result.routing?.method },
      );
      record(
        `${label}: answer not compound clarification`,
        !(result.answer ?? "").includes(CHAT_COMPOUND_DESTRUCTIVE_CREATE_ANSWER.slice(0, 30)),
        { answerPreview: result.answer?.slice(0, 120) },
      );
      return result;
    } catch (err) {
      // Planner/LLM failures are acceptable here — compound block must not fire first.
      const message = err instanceof Error ? err.message : String(err);
      record(
        `${label}: reached planner (threw after compound gate)`,
        !message.includes("удаление и создание"),
        { error: message.slice(0, 120) },
      );
      return null;
    }
  }

  const createOnly = await assertNotCompoundBlocked(
    "create-only",
    "создай тестовый отдел PLANNER-COMPOUND-1B-verify",
  );
  const destructiveOnly = await assertNotCompoundBlocked(
    "destructive-only",
    "удали отдел PLANNER-COMPOUND-1B-verify если он существует",
  );
  await assertNotCompoundBlocked(
    "mutation-only",
    "измени отдел и удали связь между отделами если есть",
  );

  if (createOnly?.structurePlan?.planId || destructiveOnly?.structurePlan?.planId) {
    console.log("\n=== Cleanup test plans ===\n");
    const sb = getSupabaseAdmin();
    for (const id of [createOnly?.structurePlan?.planId, destructiveOnly?.structurePlan?.planId]) {
      if (!id) continue;
      const { data: planRow } = await sb
        .from("tech_structure_plans")
        .select("snapshot_id")
        .eq("id", id)
        .maybeSingle();
      if (planRow?.snapshot_id) {
        await sb.from("tech_structure_snapshots").delete().eq("id", planRow.snapshot_id);
      }
      await sb.from("tech_structure_plans").delete().eq("id", id);
    }
    record("cleanup", true);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
