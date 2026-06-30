/**
 * MAYOR-PATH-1B: Mayor usage attribution (mayor_answer + conversation_id in llm_usage_logs).
 * Run: npx tsx scripts/verify_mayor_path_1b.ts
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { executeChatTask } from "../lib/execute-chat-task";
import { formatWorkspaceMayorConversationId } from "../lib/mayor-conversation-memory";
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

async function main() {
  const source = await fs.promises.readFile("lib/execute-chat-task.ts", "utf8");
  record("executeMayorTask passes usagePurpose mayor_answer", source.includes('usagePurpose: "mayor_answer"'));
  record(
    "Mayor path wrapped in runWithLlmUsageContext",
    source.includes("executeMayorTaskWithUsageContext") &&
      source.includes("runWithLlmUsageContext"),
  );

  const officeId = await requireExternalEntryOfficeId();
  const mayor = await resolveCityHallMainAgent(officeId);
  if (!mayor) {
    record("City Hall mayor configured", false);
    return;
  }

  const conversationId = formatWorkspaceMayorConversationId(`verify-1b-${Date.now()}`);
  const taskText = `MAYOR-PATH-1B verify: ответь одним словом «ок» ${Date.now()}`;
  const before = new Date().toISOString();

  const result = await executeChatTask(taskText, mayor.chamberRegistryId, "fast", {
    targetAgentId: mayor.agentId,
    directTargetEntityId: mayor.chamberRegistryId,
    conversationId,
  });

  record("executeChatTask fast mayor: single mode", result.mode === "single", {
    executionMode: result.executionMode,
    agentId: result.agentId,
  });
  record("Mayor agent id matches orchestrator", result.agentId === mayor.agentId);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: rows, error } = await supabase
    .from("llm_usage_logs")
    .select("purpose, conversation_id, provider, model_id, created_at")
    .eq("conversation_id", conversationId)
    .eq("purpose", "mayor_answer")
    .gte("created_at", before)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    record("llm_usage_logs query", false, error.message);
    return;
  }

  const row = rows?.[0];
  record("mayor_answer row logged with conversation_id", Boolean(row), row ?? "no row");
  record(
    "conversation_id is workspace:mayor scope",
    row?.conversation_id?.startsWith("workspace:mayor:") === true,
    row?.conversation_id,
  );

  await supabase.from("llm_usage_logs").delete().eq("conversation_id", conversationId);
  await supabase.from("mayor_conversation_messages").delete().eq("conversation_id", conversationId);

  if (process.exitCode === 1) {
    console.error("\nSome verify_mayor_path_1b checks failed.");
  } else {
    console.log("\nAll verify_mayor_path_1b checks passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
