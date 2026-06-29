/**
 * TD-02B: destructive structure commands → graceful refusal, not planner exception.
 * Run: npx tsx scripts/verify_td02b_destructive_refusal.ts
 */
import * as fs from "fs";
import { executeChatTask } from "../lib/execute-chat-task";
import {
  CHAT_DESTRUCTIVE_MUTATION_UNSUPPORTED_ANSWER,
  hasDestructiveStructureIntent,
  isStructureMutationCommand,
} from "../lib/structure-command-intent";
import { classifyTechDepartmentIntent } from "../lib/tech-department/intent";
import { resolveCityHallMainAgent } from "../lib/workspace/city-hall-orchestrator";
import { requireExternalEntryOfficeId } from "../lib/workspace/graph-identity-required";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const RAW_PLANNER_ERROR = "Planner returned empty action list";

const DESTRUCTIVE_CASES = [
  {
    label: "bench agents anaphora",
    text: "можем удалить этих 13 не развёрнутых?",
  },
  {
    label: "delete agent",
    text: "удали агента из каталога",
  },
  {
    label: "remove building EN",
    text: "remove the marketing building",
  },
  {
    label: "delete connection",
    text: "delete connection between chambers",
  },
  {
    label: "erase chamber RU",
    text: "стереть отдел юристов",
  },
];

const NON_DESTRUCTIVE_STRUCTURE_CASES = [
  "создай отдел для маркетинга",
  "добавь здание HR",
  "назначь агента в отдел",
  "подключи кабель между отделами",
];

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function askMayor(question: string) {
  const officeId = await requireExternalEntryOfficeId();
  const mayor = await resolveCityHallMainAgent(officeId);
  if (!mayor) throw new Error("Mayor not configured");

  return executeChatTask(question, mayor.chamberRegistryId, "fast", {
    targetAgentId: mayor.agentId,
    directTargetEntityId: mayor.chamberRegistryId,
  });
}

async function main() {
  record("negated delete not destructive", !hasDestructiveStructureIntent("не удаляй агентов"), {});
  record("create not destructive", !hasDestructiveStructureIntent("создай отдел"), {});

  for (const c of DESTRUCTIVE_CASES) {
    record(`${c.label}: detector`, hasDestructiveStructureIntent(c.text), { text: c.text });
    record(`${c.label}: structure gate`, isStructureMutationCommand(c.text), { text: c.text });
    record(
      `${c.label}: tech intent structure`,
      classifyTechDepartmentIntent(c.text) === "structure",
      { intent: classifyTechDepartmentIntent(c.text) },
    );
  }

  for (const text of NON_DESTRUCTIVE_STRUCTURE_CASES) {
    record(`non-destructive not flagged: ${text.slice(0, 40)}`, !hasDestructiveStructureIntent(text), {
      text,
    });
    record(`non-destructive still structure gate: ${text.slice(0, 40)}`, isStructureMutationCommand(text), {
      text,
    });
  }

  console.log("\n--- live Mayor → Tech Dept refusal ---\n");

  for (const c of DESTRUCTIVE_CASES) {
    let result;
    let threw = false;
    try {
      result = await askMayor(c.text);
    } catch (err) {
      threw = true;
      record(`${c.label}: no exception`, false, {
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const answer = result.answer ?? "";
    record(`${c.label}: no exception`, !threw, {});
    record(`${c.label}: canonical refusal text`, answer.includes(CHAT_DESTRUCTIVE_MUTATION_UNSUPPORTED_ANSWER), {
      answer,
    });
    record(`${c.label}: no raw planner error`, !answer.includes(RAW_PLANNER_ERROR), { answer });
    record(`${c.label}: routing method unsupported`, result.routing?.method === "tech-structure-unsupported", {
      method: result.routing?.method,
    });
    record(`${c.label}: no structurePlan`, result.structurePlan == null, {
      planId: result.structurePlan?.planId ?? null,
    });
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
