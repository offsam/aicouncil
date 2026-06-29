/**
 * PLANNER-Anaphora-1B: structure command anaphora resolver.
 * Run: npx tsx scripts/verify_planner_anaphora_1b.ts
 */
import * as fs from "fs";
import pg from "pg";
import { executeChatTask } from "../lib/execute-chat-task";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import {
  formatWorkspaceMayorConversationId,
} from "../lib/mayor-conversation-memory";
import {
  hasStructureAnaphoraSignal,
  isCompleteStructureMutationWithoutAnaphora,
  resolveStructureCommandAnaphora,
  shouldAttemptStructureAnaphoraResolution,
} from "../lib/structure-anaphora-resolver";
import { isStructureMutationCommand } from "../lib/structure-command-intent";
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

const TWO_PART_HISTORY = [
  {
    role: "user" as const,
    content: "создай здание Проект А с двумя частями: часть 1 — исследование, часть 2 — разработка",
  },
  {
    role: "assistant" as const,
    content:
      "План: 1) create_building «Проект А» 2) create_chamber «Исследование» 3) create_chamber «Разработка»",
  },
];

const PREVIOUS_DEPT_HISTORY = [
  {
    role: "user" as const,
    content: "создай отдел Юристы в здании Citizly",
  },
  {
    role: "assistant" as const,
    content: "Создан отдел «Юристы» (chamber) в здании Citizly.",
  },
];

async function main() {
  const officeId = await requireExternalEntryOfficeId();

  console.log("=== Static wiring ===\n");
  record("resolver module exists", fs.existsSync("lib/structure-anaphora-resolver.ts"));
  const execSrc = fs.readFileSync("lib/execute-chat-task.ts", "utf8");
  record(
    "executeMayorTask calls resolveStructureCommandAnaphora",
    execSrc.includes("resolveStructureCommandAnaphora(taskText, modelHistory"),
  );
  record(
    "executeMayorTask uses resolvedTaskText for structure gate",
    execSrc.includes("isStructureMutationCommand(resolvedTaskText)"),
  );
  record(
    "ambiguous persists clarify to memory",
    execSrc.includes('anaphoraResult.reason,\n      "clarify"'),
  );

  console.log("\n=== Detectors ===\n");
  record("сделай вторую задачу → anaphora signal", hasStructureAnaphoraSignal("сделай вторую задачу"));
  record(
    "сделай вторую задачу → should attempt",
    shouldAttemptStructureAnaphoraResolution("сделай вторую задачу"),
  );
  record(
    "создай отдел Маркетинг → no anaphora",
    !hasStructureAnaphoraSignal("создай отдел Маркетинг"),
  );
  record(
    "создай отдел Маркетинг → complete without anaphora",
    isCompleteStructureMutationWithoutAnaphora("создай отдел Маркетинг"),
  );
  record("удали предыдущий отдел → anaphora", hasStructureAnaphoraSignal("удали предыдущий отдел"));

  console.log("\n=== No history → ambiguous without LLM ===\n");
  const noHistory = await resolveStructureCommandAnaphora("сделай вторую задачу", [], { officeId });
  record("outcome ambiguous", noHistory.outcome === "ambiguous", noHistory);
  record(
    "reason mentions history",
    noHistory.outcome === "ambiguous" &&
      noHistory.reason.includes("нет истории разговора"),
    noHistory.outcome === "ambiguous" ? noHistory.reason : noHistory,
  );

  console.log("\n=== Full command → same (no expansion path) ===\n");
  const fullCmd = await resolveStructureCommandAnaphora("создай отдел Маркетинг", TWO_PART_HISTORY, {
    officeId,
  });
  record("создай отдел Маркетинг → same", fullCmd.outcome === "same", fullCmd);

  console.log("\n=== Live LLM expansion (when configured) ===\n");

  const secondPart = await resolveStructureCommandAnaphora("сделай вторую задачу", TWO_PART_HISTORY, {
    officeId,
  });
  if (secondPart.outcome === "expanded") {
    record("вторая задача → expanded", true, secondPart.expandedText);
    record(
      "expanded is structure mutation",
      isStructureMutationCommand(secondPart.expandedText),
      secondPart.expandedText,
    );
  } else {
    record("вторая задача → expanded", false, secondPart);
  }

  const deletePrev = await resolveStructureCommandAnaphora(
    "удали предыдущий отдел",
    PREVIOUS_DEPT_HISTORY,
    { officeId },
  );
  if (deletePrev.outcome === "expanded") {
    record("удали предыдущий → expanded", true, deletePrev.expandedText);
    record(
      "expanded mentions юрист or citizly",
      /юрист|citizly/i.test(deletePrev.expandedText),
      deletePrev.expandedText,
    );
  } else {
    record("удали предыдущий → expanded or ambiguous", deletePrev.outcome === "ambiguous", deletePrev);
  }

  const unknownEntity = await resolveStructureCommandAnaphora(
    "удали красный отдел",
    PREVIOUS_DEPT_HISTORY,
    { officeId },
  );
  record(
    "удали красный отдел → ambiguous (not in history)",
    unknownEntity.outcome === "ambiguous",
    unknownEntity,
  );

  console.log("\n=== Integration: Mayor clarify + DB memory ===\n");

  const mayor = await resolveCityHallMainAgent(officeId);
  if (!mayor) throw new Error("Mayor not configured");

  const conversationId = formatWorkspaceMayorConversationId(`verify-anaphora-${Date.now()}`);
  const sb = getSupabaseAdmin();

  await sb.from("mayor_conversation_messages").insert([
    {
      conversation_id: conversationId,
      role: "user",
      content: PREVIOUS_DEPT_HISTORY[0]!.content,
      kind: "answer",
    },
    {
      conversation_id: conversationId,
      role: "assistant",
      content: PREVIOUS_DEPT_HISTORY[1]!.content,
      kind: "answer",
    },
  ]);

  const clarifyResult = await executeChatTask("удали красный отдел", mayor.chamberRegistryId, "fast", {
    targetAgentId: mayor.agentId,
    directTargetEntityId: mayor.chamberRegistryId,
    conversationId,
  });

  record(
    "Mayor returns clarification answer",
    Boolean(clarifyResult.mode === "single" && clarifyResult.answer?.trim()),
    clarifyResult.answer,
  );
  record(
    "routing reason structure_anaphora_clarify",
    clarifyResult.routing?.targets[0]?.reason === "structure_anaphora_clarify",
    clarifyResult.routing,
  );

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

  const clarifyRows = await client.query(
    `SELECT role, kind, content FROM mayor_conversation_messages
     WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 2`,
    [conversationId],
  );
  record(
    "assistant clarify row in DB",
    clarifyRows.rows.some((r) => r.role === "assistant" && r.kind === "clarify"),
    clarifyRows.rows,
  );

  await client.query(`DELETE FROM mayor_conversation_messages WHERE conversation_id = $1`, [conversationId]);
  await client.end();

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
