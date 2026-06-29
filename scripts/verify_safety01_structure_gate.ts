/**
 * SAFETY-01: structure gate must not treat complaints/corrections as DB mutations.
 * Run: npx tsx scripts/verify_safety01_structure_gate.ts
 */
import * as fs from "fs";
import pg from "pg";
import { executeChatTask } from "../lib/execute-chat-task";
import { resolveDeterministicMayorRoutingDecision } from "../lib/mayor-routing";
import {
  classifyTechDepartmentIntent,
} from "../lib/tech-department/intent";
import {
  hasExplicitStructureMutationIntent,
  isComplaintOrCorrectionRequest,
  isStructureMutationCommand,
} from "../lib/structure-command-intent";
import { resolveCityHallMainAgent } from "../lib/workspace/city-hall-orchestrator";
import { requireExternalEntryOfficeId } from "../lib/workspace/graph-identity-required";
import { requireTechDepartmentBuildingId } from "../lib/workspace/graph-identity-required";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const COMPLAINT_EXACT =
  "ты не распознаешь что я тебе говорю? Или ты не сохраняешь контекст? Я спросил точное число агентов в системе ты сказал 36 это неправильный ответ мне нужен правильный";

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

type RoutingLogRow = {
  routing_action: string | null;
  routing_reasoning: string | null;
  routing_trace: unknown;
};

async function fetchRoutingLog(logId: string): Promise<RoutingLogRow | null> {
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
  const { rows } = await client.query(
    `SELECT routing_action, routing_reasoning, routing_trace FROM routing_logs WHERE id = $1`,
    [logId],
  );
  await client.end();
  return (rows[0] as RoutingLogRow | undefined) ?? null;
}

function assertNotStructureRouting(log: RoutingLogRow | null, label: string) {
  record(`${label}: routing_action not structure_delegate`, log?.routing_action !== "structure_delegate", {
    routing_action: log?.routing_action,
  });
  record(`${label}: routing_action not structure_plan`, log?.routing_action !== "structure_plan", {
    routing_action: log?.routing_action,
  });
  record(
    `${label}: answer not structure confirmation prompt`,
    !log?.routing_reasoning?.includes("structure plan pending confirmation"),
    { routing_reasoning: log?.routing_reasoning },
  );
}

async function askMayor(question: string): Promise<{ answer: string; log: RoutingLogRow | null }> {
  const officeId = await requireExternalEntryOfficeId();
  const mayor = await resolveCityHallMainAgent(officeId);
  if (!mayor) throw new Error("Mayor not configured");

  const result = await executeChatTask(question, mayor.chamberRegistryId, "fast", {
    targetAgentId: mayor.agentId,
    directTargetEntityId: mayor.chamberRegistryId,
  });
  const logId = result.routing?.routingLogId;
  const log = logId ? await fetchRoutingLog(logId) : null;
  return { answer: result.answer ?? "", log };
}

async function main() {
  console.log("=== SAFETY-01 static gate ===");

  const negativeCases = [
    { label: "exact complaint", text: COMPLAINT_EXACT },
    { label: "wrong number", text: "Это неправильная цифра" },
    {
      label: "fix answer agents",
      text: "Исправь ответ, мне нужно правильное число агентов",
    },
    { label: "wrong answer short", text: "Это неправильный ответ" },
  ] as const;

  for (const { label, text } of negativeCases) {
    record(`${label}: isComplaintOrCorrectionRequest`, isComplaintOrCorrectionRequest(text), { text: text.slice(0, 60) });
    record(`${label}: isStructureMutationCommand false`, !isStructureMutationCommand(text));
    record(`${label}: hasExplicitStructureMutationIntent false`, !hasExplicitStructureMutationIntent(text));
    record(`${label}: classifyTechDepartmentIntent not structure`, classifyTechDepartmentIntent(text) !== "structure", {
      intent: classifyTechDepartmentIntent(text),
    });
  }

  const positiveCases = [
    {
      label: "create building Restaurant",
      text: "создай здание Ресторан с описанием принимает заказы и меню ресторана",
    },
    {
      label: "DMV canonical",
      text: "В отделе юристы создай новый отдел который называется DMV в Калифорнии",
    },
  ] as const;

  for (const { label, text } of positiveCases) {
    record(`${label}: isStructureMutationCommand true`, isStructureMutationCommand(text));
    record(`${label}: classifyTechDepartmentIntent structure`, classifyTechDepartmentIntent(text) === "structure", {
      intent: classifyTechDepartmentIntent(text),
    });
  }

  const officeId = await requireExternalEntryOfficeId();
  const techBuildingId = await requireTechDepartmentBuildingId(officeId);
  const { data: buildings } = await (await import("@supabase/supabase-js")).createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
    .from("entity_registry")
    .select("id, name, routing_description")
    .eq("entity_type", "building");

  console.log("\n=== SAFETY-01 Mayor deterministic routing ===");
  for (const { label, text } of negativeCases) {
    const decision = await resolveDeterministicMayorRoutingDecision(text, buildings ?? []);
    record(`${label}: no structure_delegate decision`, decision?.matchedBy !== "structure_command", {
      decision: decision ? `${decision.action}/${decision.matchedBy}` : "null",
    });
  }

  const dmvDecision = await resolveDeterministicMayorRoutingDecision(
    positiveCases[1]!.text,
    buildings ?? [],
  );
  record("DMV: structure_delegate to Tech Dept", dmvDecision?.matchedBy === "structure_command" && dmvDecision.target === techBuildingId, {
    target: dmvDecision?.target,
    matchedBy: dmvDecision?.matchedBy,
  });

  const restaurantDecision = await resolveDeterministicMayorRoutingDecision(
    positiveCases[0]!.text,
    buildings ?? [],
  );
  record(
    "create building: structure_delegate to Tech Dept (deterministic)",
    restaurantDecision?.matchedBy === "structure_command" && restaurantDecision.target === techBuildingId,
    { target: restaurantDecision?.target, matchedBy: restaurantDecision?.matchedBy },
  );

  console.log("\n=== SAFETY-01 live Mayor path (routing_logs) ===");
  for (const { label, text } of negativeCases) {
    const { answer, log } = await askMayor(`verify-safety01-${Date.now()}: ${text}`);
    assertNotStructureRouting(log, label);
    record(`${label}: answer not structure plan prompt`, !/подтвердите выполнение/i.test(answer), {
      answer: answer.slice(0, 120),
    });
  }

  if (process.exitCode === 1) {
    console.log("\nSAFETY-01 verification FAILED");
  } else {
    console.log("\nSAFETY-01 verification PASSED");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
