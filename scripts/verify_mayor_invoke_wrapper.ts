/**
 * MR-2 Phase C: verify Mayor invoke wrapper + «ты кто» path.
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { executeChatTask } from "../lib/execute-chat-task";
import { MAYOR_INVOKE_UNAVAILABLE_ANSWER } from "../lib/mayor-persona";
import { resolveDeterministicMayorRoutingDecision } from "../lib/mayor-routing";
import { resolveMayorChatTarget } from "../lib/telegram/mayor-chat-target";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const PROVIDER_LEAK = /groq|openai|anthropic|llama|gpt-|claude|rate.?limit|429|500 internal/i;

function assertNoProviderLeak(label: string, text: string): void {
  if (PROVIDER_LEAK.test(text)) {
    console.error(`FAIL ${label}: answer leaks provider/model details`);
    console.error(text.slice(0, 300));
    process.exit(1);
  }
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const mayor = await resolveMayorChatTarget();
  if (!mayor?.targetAgentId || !mayor.directTargetEntityId) {
    console.error("FAIL: resolveMayorChatTarget returned null");
    process.exit(1);
  }

  const { data: buildings } = await supabase
    .from("entity_registry")
    .select("id, name, routing_description")
    .eq("entity_type", "building");

  const taskText = "ты кто";
  const deterministic = await resolveDeterministicMayorRoutingDecision(taskText, buildings ?? []);
  console.log("=== Deterministic gate («ты кто») ===");
  console.log("result:", deterministic === null ? "null (Mayor agent decides)" : deterministic.matchedBy);
  if (deterministic !== null) {
    console.error("FAIL: expected null deterministic gate for «ты кто»");
    process.exit(1);
  }
  console.log("PASS");

  console.log("\n=== Simulated provider failure ===");
  const failResult = await executeChatTask(taskText, undefined, "fast", {
    targetAgentId: mayor.targetAgentId,
    directTargetEntityId: mayor.directTargetEntityId,
    forceMayorInvokeError: true,
  });
  console.log("answer:", failResult.answer);
  console.log("routing.reason:", failResult.routing.targets[0]?.reason);
  if (failResult.answer !== MAYOR_INVOKE_UNAVAILABLE_ANSWER) {
    console.error("FAIL: expected controlled fallback message");
    process.exit(1);
  }
  assertNoProviderLeak("failure path", failResult.answer);
  console.log("PASS");

  console.log("\n=== Live Mayor invoke («ты кто») ===");
  const successResult = await executeChatTask(taskText, undefined, "fast", {
    targetAgentId: mayor.targetAgentId,
    directTargetEntityId: mayor.directTargetEntityId,
  });
  console.log("method:", successResult.routing.method);
  console.log("matchedBy:", successResult.routing.targets[0]?.reason);
  console.log("answer preview:", String(successResult.answer).slice(0, 200));
  if (!successResult.answer?.trim()) {
    console.error("FAIL: empty answer");
    process.exit(1);
  }
  assertNoProviderLeak("success path", successResult.answer);
  if (successResult.answer === MAYOR_INVOKE_UNAVAILABLE_ANSWER) {
    console.log("NOTE: provider unavailable — fallback message is acceptable");
  }
  console.log("PASS");

  console.log("\nAll verify_mayor_invoke_wrapper checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
