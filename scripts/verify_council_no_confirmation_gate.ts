/**
 * Verify Council mode sends directly to Mayor (no confirmation gate) — SEC council fix.
 * Run: npx tsx scripts/verify_council_no_confirmation_gate.ts
 */
import * as fs from "fs";
import pg from "pg";
import { executeChatTask } from "../lib/execute-chat-task";
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
  const chatSource = await fs.promises.readFile(
    "components/workspace/WorkspaceMayorChat.tsx",
    "utf8",
  );

  record(
    "WorkspaceMayorChat: no CouncilConfirmationGate import",
    !chatSource.includes("CouncilConfirmationGate"),
  );
  record(
    "WorkspaceMayorChat: no openCouncilGate call on submit",
    !chatSource.includes("openCouncilGate"),
  );
  record(
    "WorkspaceMayorChat: mayor council payload includes targetAgentId",
    /orchestrator && \(mode === "fast" \|\| mode === "council"\)/.test(chatSource) &&
      chatSource.includes("targetAgentId: orchestrator.agentId"),
  );
  record(
    "TechStructureConfirmationGate still present for structure plans",
    chatSource.includes("TechStructureConfirmationGate"),
  );

  const officeId = await requireExternalEntryOfficeId();
  const mayor = await resolveCityHallMainAgent(officeId);
  const taskText = `verify-council-mayor-${Date.now()}: кто ты одним предложением?`;

  const before = Date.now();
  const result = await executeChatTask(taskText, mayor.chamberRegistryId, "council", {
    targetAgentId: mayor.agentId,
    directTargetEntityId: mayor.chamberRegistryId,
  });
  const elapsedMs = Date.now() - before;

  record("Council Mayor invoke returns answer", Boolean(result.answer?.trim()), {
    snippet: result.answer?.slice(0, 120),
    elapsedMs,
  });
  record("executionMode=council in result", result.executionMode === "council");
  record("Mayor agent invoked (agentCount>=1)", (result.routing?.agentCount ?? 0) >= 1, {
    agentCount: result.routing?.agentCount,
    routingLogId: result.routing?.routingLogId,
  });
  record(
    "Not provider-unavailable generic message",
    !result.answer?.includes("не смог получить ответ от модели"),
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

  const logId = result.routing?.routingLogId;
  if (logId) {
    const { rows } = await client.query(
      `SELECT id, task_text, method, routing_action, agent_count, created_at
       FROM routing_logs WHERE id = $1`,
      [logId],
    );
    record("SQL routing_logs row for council Mayor invoke", rows.length === 1, rows[0]);
    record(
      "SQL agent_count >= 1",
      rows[0]?.agent_count >= 1,
      { agent_count: rows[0]?.agent_count },
    );
  } else {
    record("SQL routing_logs row for council Mayor invoke", false, { reason: "no routingLogId" });
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
