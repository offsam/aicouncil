/**
 * Mayor conversation memory + clarify cap verification.
 * Run: npx tsx scripts/verify_mayor_conversation_memory.ts
 */
import * as fs from "fs";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import {
  appendMayorConversationTurn,
  formatTelegramMayorConversationId,
  loadMayorConversationHistory,
  mayorClarifyAllowed,
  MAYOR_CONVERSATION_MAX_MESSAGES,
} from "../lib/mayor-conversation-memory";
import {
  finalizeMayorRoutingDecision,
  parseMayorAgentRoutingEnvelope,
} from "../lib/mayor-routing";
import { mayorRoutingLogAction } from "../lib/mayor-routing";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

type Check = { name: string; pass: boolean; details: Record<string, unknown> };
const checks: Check[] = [];

function record(name: string, pass: boolean, details: Record<string, unknown>) {
  checks.push({ name, pass, details });
  console.log(pass ? "PASS" : "FAIL", name);
  console.log(JSON.stringify(details, null, 2));
}

async function ensureTable() {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("mayor_conversation_messages").select("id").limit(1);
  if (error?.message.includes("does not exist")) {
    throw new Error(
      "mayor_conversation_messages table missing — apply supabase/migrations/20260628150000_mayor_conversation_messages.sql",
    );
  }
}

async function main() {
  record(
    "telegram conversation id format",
    formatTelegramMayorConversationId(12345) === "telegram:12345",
    { id: formatTelegramMayorConversationId(12345) },
  );

  record(
    "clarify cap — allowed on fresh thread",
    mayorClarifyAllowed([]) === true,
    { allowed: mayorClarifyAllowed([]) },
  );

  record(
    "clarify cap — blocked after clarify turn",
    mayorClarifyAllowed([
      { role: "user", content: "удали это", kind: "answer" },
      { role: "assistant", content: "Что именно удалить?", kind: "clarify" },
    ]) === false,
    { allowed: false },
  );

  const clarifyRaw = JSON.stringify({
    routing: {
      action: "clarify",
      matchedBy: "semantic",
      confidence: 0.55,
      reasoning: "Costly ambiguity",
      trace: ["mayor_agent", "clarify"],
    },
    answer: "Какое здание имеете в виду — ЮРИСТЫ или Citizly?",
  });
  const clarifyParsed = parseMayorAgentRoutingEnvelope(clarifyRaw, []);
  record(
    "parse clarify envelope",
    clarifyParsed.decision.action === "clarify" &&
      clarifyParsed.answer?.includes("ЮРИСТЫ") === true,
    {
      action: clarifyParsed.decision.action,
      answer: clarifyParsed.answer,
      logAction: mayorRoutingLogAction(clarifyParsed.decision),
    },
  );

  const clarifyFinal = await finalizeMayorRoutingDecision(clarifyParsed.decision, new Set());
  record(
    "finalize clarify passes through",
    clarifyFinal.action === "clarify",
    { action: clarifyFinal.action },
  );

  await ensureTable();

  const testConv = `telegram:verify-${Date.now()}`;
  await appendMayorConversationTurn(testConv, "Меня зовут Тест", "Запомнил.", "answer");
  await appendMayorConversationTurn(testConv, "Как меня зовут?", "Вас зовут Тест.", "answer");

  const history = await loadMayorConversationHistory(testConv);
  record(
    "persist and load turns",
    history.length === 4 &&
      history[0]?.content === "Меня зовут Тест" &&
      history[3]?.content.includes("Тест"),
    { count: history.length, last: history[history.length - 1]?.content },
  );

  const otherConv = `telegram:verify-other-${Date.now()}`;
  const otherHistory = await loadMayorConversationHistory(otherConv);
  record("new chat_id starts empty", otherHistory.length === 0, { count: otherHistory.length });

  record(
    "stored assistant is plain text not JSON envelope",
    !history.some((m) => m.role === "assistant" && m.content.trimStart().startsWith("{")),
    {
      assistantSamples: history.filter((m) => m.role === "assistant").map((m) => m.content),
    },
  );

  record(
    "history cap constant defined",
    MAYOR_CONVERSATION_MAX_MESSAGES >= 20,
    { max: MAYOR_CONVERSATION_MAX_MESSAGES },
  );

  const failed = checks.filter((c) => !c.pass);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${checks.length} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
