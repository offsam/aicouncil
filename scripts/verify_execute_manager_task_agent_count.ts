/**
 * Verify executeManagerTask writes routing_logs.agent_count = 1 after successful worker invoke.
 * Run: npx tsx scripts/verify_execute_manager_task_agent_count.ts
 */
import * as fs from "fs";
import { executeChatTask } from "../lib/execute-chat-task";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import { resolveMayorChatTarget } from "../lib/telegram/mayor-chat-target";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function sampleDelegatedManagerLogs(limit: number) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("routing_logs")
    .select(
      "id, task_text, method, agent_count, routing_action, created_at, delegated_building_id",
    )
    .not("routing_action", "is", null)
    .eq("method", "llm-cheap")
    .eq("agent_count", 0)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function main() {
  console.log("=== BEFORE: recent delegated manager logs with agent_count = 0 ===");
  const before = await sampleDelegatedManagerLogs(5);
  if (before.length === 0) {
    console.log("(no rows matching filter — older history may already differ)");
  } else {
    for (const row of before) {
      console.log(JSON.stringify(row));
    }
  }

  const mayor = await resolveMayorChatTarget();
  if (!mayor?.targetAgentId || !mayor.directTargetEntityId) {
    throw new Error("Mayor chat target not configured");
  }

  const marker = `verify-manager-agent-count-${Date.now()}`;
  const taskText = `${marker}: краткий ответ по делу Putnis — когда заседание?`;

  console.log("\n=== RUN: Mayor → delegate → executeManagerTask ===");
  const result = await executeChatTask(taskText, undefined, "fast", {
    targetAgentId: mayor.targetAgentId,
    directTargetEntityId: mayor.directTargetEntityId,
    conversationId: `telegram:verify-${Date.now()}`,
  });

  const logId = result.routing?.routingLogId;
  if (!logId) {
    throw new Error("Expected routingLogId on delegated manager result");
  }

  const supabase = getSupabaseAdmin();
  const { data: logRow, error } = await supabase
    .from("routing_logs")
    .select(
      "id, task_text, method, agent_count, routing_action, routing_matched_by, delegated_building_id, delegated_chamber_id, created_at",
    )
    .eq("id", logId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!logRow) throw new Error(`routing_logs row not found: ${logId}`);

  console.log("\n=== AFTER: new executeManagerTask routing_logs row ===");
  console.log(JSON.stringify(logRow));

  const pass =
    logRow.agent_count === 1 &&
    logRow.routing_action != null &&
    logRow.method === "llm-cheap" &&
    Boolean(result.agentId);

  console.log("\n=== CHECKS ===");
  console.log("worker invoked (result.agentId):", result.agentId ?? "(none)");
  console.log("routing_logs.agent_count === 1:", logRow.agent_count === 1 ? "PASS" : "FAIL");
  console.log("routing_action set:", logRow.routing_action != null ? "PASS" : "FAIL");

  if (!pass) process.exit(1);
  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
