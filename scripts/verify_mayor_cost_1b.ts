/**
 * MAYOR-COST-1B: Mayor prompt history cap (~1200 est. tokens).
 * Run: npx tsx scripts/verify_mayor_cost_1b.ts
 */
import * as fs from "fs";
import {
  estimateMayorHistoryTokens,
  loadMayorConversationHistory,
  mayorConversationTurnsForModel,
  MAYOR_PROMPT_HISTORY_MAX_EST_TOKENS,
  trimMayorConversationTurnsForPrompt,
  type MayorConversationTurn,
} from "../lib/mayor-conversation-memory";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

function makePairs(count: number, contentChars: number): MayorConversationTurn[] {
  const filler = "x".repeat(contentChars);
  const turns: MayorConversationTurn[] = [];
  for (let i = 0; i < count; i++) {
    turns.push({ role: "user", content: `${filler}-u${i}` });
    turns.push({ role: "assistant", content: `${filler}-a${i}` });
  }
  return turns;
}

function simulateSessionMessageCount(pairCount: number, contentChars: number) {
  const full = makePairs(pairCount, contentChars);
  const trimmed = trimMayorConversationTurnsForPrompt(full);
  return {
    pairCount,
    fullMessages: full.length,
    trimmedMessages: trimmed.length,
    fullEstTokens: estimateMayorHistoryTokens(full),
    trimmedEstTokens: estimateMayorHistoryTokens(trimmed),
  };
}

async function main() {
  record(
    "cap constant is 1200 tokens",
    MAYOR_PROMPT_HISTORY_MAX_EST_TOKENS === 1200,
  );

  const short = makePairs(5, 80);
  const shortTrimmed = trimMayorConversationTurnsForPrompt(short);
  record(
    "short session (5 pairs) — no trimming",
    shortTrimmed.length === short.length &&
      estimateMayorHistoryTokens(shortTrimmed) === estimateMayorHistoryTokens(short),
    {
      messages: short.length,
      estTokens: estimateMayorHistoryTokens(short),
    },
  );

  const msg5 = simulateSessionMessageCount(5, 300);
  const msg20 = simulateSessionMessageCount(20, 300);
  record(
    "5 pairs vs 20 pairs — trimmed tokens capped (not proportional)",
    msg5.fullEstTokens === msg5.trimmedEstTokens &&
      msg20.fullEstTokens > msg20.trimmedEstTokens &&
      msg20.trimmedEstTokens <= MAYOR_PROMPT_HISTORY_MAX_EST_TOKENS,
    { msg5, msg20 },
  );
  record(
    "20-pair session trims oldest messages",
    msg20.trimmedMessages < msg20.fullMessages,
    { full: msg20.fullMessages, trimmed: msg20.trimmedMessages },
  );

  const largeLastPair = makePairs(10, 200);
  const lastUserIdx = largeLastPair.length - 2;
  largeLastPair[lastUserIdx] = {
    role: "user",
    content: "u".repeat(6000),
  };
  largeLastPair[lastUserIdx + 1] = {
    role: "assistant",
    content: "a".repeat(6000),
  };
  const largeTrimmed = trimMayorConversationTurnsForPrompt(largeLastPair);
  record(
    "last user/assistant pair preserved whole even when >1200 tokens",
    largeTrimmed.length === 2 &&
      largeTrimmed[0].content === largeLastPair[lastUserIdx].content &&
      largeTrimmed[1].content === largeLastPair[lastUserIdx + 1].content,
    {
      trimmedMessages: largeTrimmed.length,
      estTokens: estimateMayorHistoryTokens(largeTrimmed),
    },
  );

  record(
    "trim removes whole messages only (no partial content)",
    largeTrimmed.every((t) =>
      largeLastPair.some((full) => full.role === t.role && full.content === t.content),
    ),
  );

  const source = fs.readFileSync("lib/mayor-conversation-memory.ts", "utf8");
  const loadFn = source.match(
    /export async function loadMayorConversationHistory[\s\S]*?\n\}/,
  )?.[0] ?? "";
  record(
    "loadMayorConversationHistory does not call trim",
    loadFn.length > 0 && !loadFn.includes("trimMayorConversationTurnsForPrompt"),
  );

  const execSource = fs.readFileSync("lib/execute-chat-task.ts", "utf8");
  record(
    "executeMayorTask applies trim when building modelHistory",
    execSource.includes("trimMayorConversationTurnsForPrompt("),
  );

  console.log("\nBefore/after est. token counts (300 chars per message, pairs):");
  console.table([
    simulateSessionMessageCount(5, 300),
    simulateSessionMessageCount(10, 300),
    simulateSessionMessageCount(20, 300),
  ]);

  console.log(process.exitCode === 1 ? "\nSome checks FAILED" : "\nAll checks PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
