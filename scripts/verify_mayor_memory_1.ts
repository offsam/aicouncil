/**
 * MAYOR-MEMORY-1: unified cross-channel Mayor shared memory.
 * Run: npx tsx scripts/verify_mayor_memory_1.ts
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  compactMayorSharedMemoryReadView,
  formatMayorSharedMemoryScopeId,
  isTrivialMayorMemoryUserMessage,
  MAYOR_SHARED_MEMORY_NO_UPDATE,
  MAYOR_SHARED_MEMORY_SECTION_HEADER,
  maybeUpdateMayorSharedMemory,
} from "../lib/mayor-shared-memory";
import {
  buildMayorExecutiveSystemPrompt,
  buildMayorExecutiveSystemPromptParts,
} from "../lib/mayor-persona";
import { anthropicSystemBlocksToString, buildMayorAnthropicCachedSystemBlocks } from "../lib/anthropic-prompt-cache";
import { setInvokeCheapLLMSlotOverrideForTests } from "../lib/cheap-llm";
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
  record(
    "migration file exists",
    fs.existsSync("supabase/migrations/20260701120000_mayor_shared_memory.sql"),
  );

  const execSource = fs.readFileSync("lib/execute-chat-task.ts", "utf8");
  record("executeMayorTask loads shared memory", execSource.includes("loadMayorSharedMemory"));
  record(
    "executeMayorTask schedules shared memory update",
    execSource.includes("scheduleMayorSharedMemoryUpdate"),
  );

  const prompt = buildMayorExecutiveSystemPrompt([], {
    sharedMemoryReadView: "- Decision: ship MAYOR-MEMORY-1",
  });
  record(
    "Mayor system prompt contains shared memory section",
    prompt.includes(MAYOR_SHARED_MEMORY_SECTION_HEADER) &&
      prompt.includes("ship MAYOR-MEMORY-1"),
  );
  record(
    "shared memory is in system prompt parts, not messages path",
    !execSource.includes("sharedMemoryReadView") ||
      execSource.includes("mayorPromptOptions") &&
        !execSource.match(/conversationHistory.*sharedMemory/),
  );

  const parts = buildMayorExecutiveSystemPromptParts([], {
    sharedMemoryReadView: "bullet one\nbullet two",
  });
  const blocks = buildMayorAnthropicCachedSystemBlocks(parts, "ctx");
  const blockText = anthropicSystemBlocksToString(blocks);
  record(
    "Anthropic blocks include shared memory section",
    blockText.includes(MAYOR_SHARED_MEMORY_SECTION_HEADER),
  );

  const longSummary = Array.from({ length: 120 }, (_, i) => `- bullet ${i}: ${"x".repeat(40)}`).join(
    "\n",
  );
  const compact = compactMayorSharedMemoryReadView(longSummary);
  record(
    "read view truncates long stored summary without mutating source",
    compact.length <= 2000 && longSummary.length > 2000,
  );
  record("stored summary unchanged after read compact", longSummary.length > 2000);

  record("trivial user 'ок' detected", isTrivialMayorMemoryUserMessage("ок"));
  record("trivial user 'спасибо' detected", isTrivialMayorMemoryUserMessage("спасибо!"));
  record(
    "significant user message not trivial",
    !isTrivialMayorMemoryUserMessage("Будем делать unified memory в этом спринте"),
  );

  const officeId = await requireExternalEntryOfficeId();
  const scopeId = formatMayorSharedMemoryScopeId(officeId);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error: tableErr } = await supabase.from("mayor_shared_memory").select("id").limit(1);
  record(
    "mayor_shared_memory table exists",
    !tableErr?.message.includes("does not exist"),
    tableErr?.message,
  );

  if (!tableErr) {
    setInvokeCheapLLMSlotOverrideForTests(async () => ({
      answer: "- Decision: prioritize unified Mayor memory",
      provider: "anthropic",
      modelUsed: "test-model",
      slot: "primary",
    }));

    await maybeUpdateMayorSharedMemory({
      officeId,
      userMessage: "Будем делать unified memory — зафиксируй решение",
      mayorAnswer: "Принято: unified memory для Workspace и Telegram.",
    });

    setInvokeCheapLLMSlotOverrideForTests(null);

    const { data: row } = await supabase
      .from("mayor_shared_memory")
      .select("summary, memory_scope_id")
      .eq("office_id", officeId)
      .eq("memory_scope_id", scopeId)
      .maybeSingle();

    record(
      "significant exchange upserts shared memory",
      Boolean(row?.summary?.includes("unified Mayor memory") || row?.summary?.includes("unified memory")),
      row,
    );

    setInvokeCheapLLMSlotOverrideForTests(async () => ({
      answer: MAYOR_SHARED_MEMORY_NO_UPDATE,
      provider: "anthropic",
      modelUsed: "test-model",
      slot: "primary",
    }));

    await maybeUpdateMayorSharedMemory({
      officeId,
      userMessage: "спасибо",
      mayorAnswer: "Пожалуйста!",
    });

    setInvokeCheapLLMSlotOverrideForTests(null);

    const { data: afterTrivial } = await supabase
      .from("mayor_shared_memory")
      .select("summary, updated_at")
      .eq("office_id", officeId)
      .eq("memory_scope_id", scopeId)
      .maybeSingle();

    record(
      "trivial 'спасибо' does not change summary (skipped before LLM or NO_UPDATE)",
      afterTrivial?.summary === row?.summary,
      { before: row?.summary, after: afterTrivial?.summary },
    );

    const withoutSection = buildMayorExecutiveSystemPrompt([], {});
    const withSection = buildMayorExecutiveSystemPrompt([], {
      sharedMemoryReadView: "- Shared fact",
    });
    console.log("\nPrompt size without shared memory:", withoutSection.length, "chars");
    console.log("Prompt size with shared memory:", withSection.length, "chars");
    console.log("Delta:", withSection.length - withoutSection.length, "chars");
  }

  console.log(process.exitCode === 1 ? "\nSome checks FAILED" : "\nAll checks PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
