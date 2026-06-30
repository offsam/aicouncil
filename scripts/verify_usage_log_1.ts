/**
 * USAGE-LOG-1: verify llm_usage_logs after provider invoke + DB round-trip.
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { executeChatTask } from "../lib/execute-chat-task";
import { insertLlmUsageLog } from "../lib/llm-usage-log";
import { invokeCheapLLMSlot } from "../lib/cheap-llm";
import { runWithLlmUsageContext } from "../lib/llm-usage-context";
import { resolveMayorChatTarget } from "../lib/telegram/mayor-chat-target";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const TEST_CONV = `verify:usage-log-1:${Date.now()}`;

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error: tableErr } = await supabase.from("llm_usage_logs").select("id").limit(1);
  if (tableErr) {
    console.error("FAIL: llm_usage_logs table missing — apply migration first:", tableErr.message);
    process.exit(1);
  }
  console.log("PASS: llm_usage_logs table exists");

  const syntheticId = await insertLlmUsageLog({
    provider: "test",
    modelId: "synthetic",
    purpose: "verify_synthetic",
    rawUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    conversationId: TEST_CONV,
  });
  if (!syntheticId) {
    console.error("FAIL: synthetic insert");
    process.exit(1);
  }
  console.log("PASS: synthetic insert", syntheticId);

  let liveRow: Record<string, unknown> | null = null;

  await runWithLlmUsageContext(
    { conversationId: TEST_CONV, executionMode: "fast" },
    async () => {
      try {
        const slot = await invokeCheapLLMSlot(
          {
            purpose: "manager-routing",
            prompt: 'Return JSON only: {"action":"answer_self","confidence":1}',
            responseFormat: "json",
            maxTokens: 64,
            temperature: 0,
          },
          "primary",
        );
        console.log("invokeCheapLLMSlot manager-routing:", slot.provider, slot.modelUsed);

        const { data: cheapRows } = await supabase
          .from("llm_usage_logs")
          .select("*")
          .eq("conversation_id", TEST_CONV)
          .eq("purpose", "manager-routing")
          .order("created_at", { ascending: false })
          .limit(1);
        liveRow = cheapRows?.[0] ?? null;
        if (liveRow) {
          console.log("PASS: manager-routing usage logged via invokeCheapLLMSlot");
        }
      } catch (cheapErr) {
        console.warn("invokeCheapLLMSlot skipped:", cheapErr instanceof Error ? cheapErr.message : cheapErr);
      }

      const mayor = await resolveMayorChatTarget();
      if (mayor?.targetAgentId && !liveRow) {
        const before = new Date().toISOString();
        try {
          await executeChatTask("USAGE-LOG-1 verify: ответь одним словом «ок»", undefined, "fast", {
            targetAgentId: mayor.targetAgentId,
            directTargetEntityId: mayor.directTargetEntityId,
            conversationId: TEST_CONV,
          });
          const { data: mayorRows } = await supabase
            .from("llm_usage_logs")
            .select("*")
            .eq("conversation_id", TEST_CONV)
            .eq("purpose", "mayor_answer")
            .gte("created_at", before)
            .limit(1);
          liveRow = mayorRows?.[0] ?? liveRow;
        } catch (mayorErr) {
          console.warn("Mayor invoke skipped:", mayorErr instanceof Error ? mayorErr.message : mayorErr);
        }
      }
    },
  );

  if (!liveRow) {
    console.error("FAIL: no live LLM usage row (check provider credits/keys)");
    process.exit(1);
  }

  if (liveRow.raw_usage == null && liveRow.input_tokens == null) {
    console.error("FAIL: live row missing usage", liveRow);
    process.exit(1);
  }

  console.log("PASS: live LLM usage logged");
  console.log(JSON.stringify(liveRow, null, 2));

  await supabase.from("llm_usage_logs").delete().eq("conversation_id", TEST_CONV);
  console.log("\nAll verify_usage_log_1 checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
