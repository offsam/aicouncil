/**
 * DEBATE-ERROR-HANDLING-1: verify debate session closes on invoke failure.
 * Run: npx tsx scripts/verify_debate_error_handling_1.ts
 */
import * as fs from "fs";
import { debateTierMode } from "../lib/debate/types";
import {
  DebateInvokeFailedError,
  USER_DEBATE_INVOKE_FAILED_MESSAGE,
} from "../lib/debate/debate-invoke-error";
import { runAgentDebate } from "../lib/debate/run-agent-debate";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import { looksLikeProviderErrorText } from "../lib/provider-user-error";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import { resolveCityHallMainAgent } from "../lib/workspace/city-hall-orchestrator";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function resolveCallerEntityId(): Promise<string> {
  const mayor = await resolveCityHallMainAgent(AI_COUNCIL_OFFICE_ID);
  if (!mayor?.chamberRegistryId) {
    throw new Error("Mayor chamber not found for verify script");
  }
  return mayor.chamberRegistryId;
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function loadSession(debateId: string) {
  const supabase = getSupabaseAdmin();
  const [{ data: session }, { data: rounds }] = await Promise.all([
    supabase.from("agent_debates").select("*").eq("id", debateId).maybeSingle(),
    supabase.from("agent_debate_rounds").select("round_index, action").eq("debate_id", debateId),
  ]);
  return { session, rounds: rounds ?? [] };
}

async function testForceInvokeError() {
  const callerEntityId = await resolveCallerEntityId();
  let caught: DebateInvokeFailedError | null = null;
  try {
    await runAgentDebate({
      question: "t_debate_error_handling_1 force invoke",
      callerEntityId,
      callerKind: "mayor",
      tierMode: debateTierMode("free"),
      deterministicAlwaysRevise: true,
      forceInvokeError: true,
    });
  } catch (err) {
    if (err instanceof DebateInvokeFailedError) caught = err;
    else throw err;
  }

  record("throws DebateInvokeFailedError", caught instanceof DebateInvokeFailedError);
  if (!caught) return;

  record(
    "user message has no raw provider leak",
    !looksLikeProviderErrorText(caught.userMessage) &&
      !caught.userMessage.includes("Forced workflow"),
    caught.userMessage,
  );
  record(
    "user message is friendly preset",
    caught.userMessage === USER_DEBATE_INVOKE_FAILED_MESSAGE,
  );

  const { session, rounds } = await loadSession(caught.debateId);
  record("session status closed", session?.status === "closed");
  record("closed_reason error", session?.closed_reason === "error");
  record("initial round preserved", rounds.some((r) => r.action === "initial"));
  record("no round inserted after failure", rounds.length === 1, { rounds });
}

async function listStuckActiveSessions() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_debates")
    .select("id, question, status, closed_reason, created_at, current_turn_agent_id")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Could not query active debates:", error.message);
    return;
  }

  console.log("\n=== Active debate sessions (candidates for manual close) ===");
  if (!data?.length) {
    console.log("(none)");
    return;
  }

  for (const row of data) {
    const { count } = await supabase
      .from("agent_debate_rounds")
      .select("*", { count: "exact", head: true })
      .eq("debate_id", row.id);
    console.log({
      id: row.id,
      question: row.question.slice(0, 80),
      created_at: row.created_at,
      current_turn_agent_id: row.current_turn_agent_id,
      round_count: count ?? 0,
    });
  }

  const ids = data.map((r) => r.id);
  console.log("\n--- SQL to close stuck sessions (run only after explicit approval) ---");
  console.log(`-- ${ids.length} active session(s)`);
  console.log(`UPDATE agent_debates
SET
  status = 'closed',
  closed_reason = 'error',
  closed_at = now(),
  current_turn_agent_id = NULL
WHERE id IN (
  ${ids.map((id) => `'${id}'`).join(",\n  ")}
)
  AND status = 'active';`);
}

async function main() {
  console.log("=== Force invoke error (deterministic, free tier) ===");
  await testForceInvokeError();
  await listStuckActiveSessions();

  if (process.exitCode === 1) {
    console.error("\nSome checks failed.");
  } else {
    console.log("\nAll verify_debate_error_handling_1 checks passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
