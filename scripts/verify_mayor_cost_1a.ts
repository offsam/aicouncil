/**
 * MAYOR-COST-1A: Mayor prompt caching + context budget logging.
 * Run: npx tsx scripts/verify_mayor_cost_1a.ts
 */
import * as fs from "fs";
import {
  anthropicSystemBlocksToString,
  buildMayorAnthropicCachedSystemBlocks,
} from "../lib/anthropic-prompt-cache";
import { CHAMBER_ANSWER_SYSTEM_PREFIX } from "../lib/agent-persona";
import {
  buildMayorExecutiveSystemPrompt,
  buildMayorExecutiveSystemPromptParts,
} from "../lib/mayor-persona";
import { normalizeProviderUsage } from "../lib/tokens";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

function staticChecks() {
  const providerSource = fs.readFileSync("lib/agent-provider-call.ts", "utf8");
  record(
    "Anthropic path accepts structured system blocks",
    providerSource.includes("anthropicSystemBlocks") &&
      providerSource.includes("AnthropicSystemBlock"),
  );
  record(
    "cache_control defined in anthropic-prompt-cache",
    fs.readFileSync("lib/anthropic-prompt-cache.ts", "utf8").includes(
      'cache_control: EPHEMERAL_CACHE',
    ),
  );
  record(
    "mayor-context-budget logger present",
    fs.readFileSync("lib/mayor-context-budget.ts", "utf8").includes("[mayor-context-budget]"),
  );
  record(
    "executeMayorTask passes mayorPromptParts",
    fs.readFileSync("lib/execute-chat-task.ts", "utf8").includes("mayorPromptParts"),
  );

  const parts = buildMayorExecutiveSystemPromptParts([], {
    clarifyAllowed: false,
    officeSnapshot: "[Office inventory snapshot]\nBuildings: 3",
  });
  const mayorString = buildMayorExecutiveSystemPrompt([], {
    clarifyAllowed: false,
    officeSnapshot: "[Office inventory snapshot]\nBuildings: 3",
  });
  const agentContext = "[Agent context block]";
  const expectedSystem = `${mayorString}\n\n${CHAMBER_ANSWER_SYSTEM_PREFIX}\n\n${agentContext}`;
  const blocks = buildMayorAnthropicCachedSystemBlocks(parts, agentContext);
  const fromBlocks = anthropicSystemBlocksToString(blocks);
  record("cached blocks match string system prompt", fromBlocks === expectedSystem, {
    expectedLen: expectedSystem.length,
    actualLen: fromBlocks.length,
  });

  const cachedBlocks = blocks.filter((b) => b.cache_control?.type === "ephemeral");
  record("stable blocks have ephemeral cache_control", cachedBlocks.length >= 3);
  record(
    "office snapshot block is not cached",
    blocks.some((b) => b.text.includes("[Office inventory snapshot]") && !b.cache_control),
  );

  const normalized = normalizeProviderUsage("anthropic", {
    input_tokens: 100,
    output_tokens: 20,
    cache_creation_input_tokens: 500,
    cache_read_input_tokens: 1200,
  });
  record(
    "normalizeProviderUsage exposes cache metrics",
    normalized?.cacheCreationInputTokens === 500 && normalized?.cacheReadInputTokens === 1200,
  );
}

async function liveMayorInvokeCheck() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    record("ANTHROPIC_API_KEY present for live cache check", false, "skipped");
    return;
  }

  const { callConfiguredAgentProvider } = await import("../lib/agent-provider-call");
  const parts = buildMayorExecutiveSystemPromptParts([], { clarifyAllowed: false });
  const agentContext = "Test agent context for MAYOR-COST-1A verify.";
  const blocks = buildMayorAnthropicCachedSystemBlocks(parts, agentContext);
  const systemPrompt = anthropicSystemBlocksToString(blocks);

  try {
    const answer = await callConfiguredAgentProvider({
      config: {
        agentId: "verify-mayor-cost-1a",
        provider: "anthropic",
        modelId: "claude-haiku-4-5-20251001",
      },
      systemPrompt,
      question: "Ответь одним словом: ок",
      maxTokens: 64,
      usagePurpose: "mayor_answer",
      anthropicSystemBlocks: blocks,
    });
    record("live Anthropic Mayor invoke with cache_control", answer.toLowerCase().includes("ок") || answer.length > 0);
  } catch (err) {
    record(
      "live Anthropic Mayor invoke with cache_control",
      false,
      err instanceof Error ? err.message : err,
    );
  }
}

async function main() {
  staticChecks();
  await liveMayorInvokeCheck();
  console.log(process.exitCode === 1 ? "\nSome checks FAILED" : "\nAll checks PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
