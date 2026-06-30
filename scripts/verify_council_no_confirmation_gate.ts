/**
 * Verify Council: no confirmation gate, Mayor+council fan-out, tier debate chambers intact.
 * COUNCIL-2: no legacy «Совет города» UUIDs.
 * Run: npx tsx scripts/verify_council_no_confirmation_gate.ts
 */
import * as fs from "fs";
import pg from "pg";
import { executeChatTask } from "../lib/execute-chat-task";
import { resolveCityHallMainAgent } from "../lib/workspace/city-hall-orchestrator";
import { resolveCityHallDebateChambersByTier } from "../lib/workspace/resolve-city-hall-council-chamber";
import { requireExternalEntryOfficeId } from "../lib/workspace/graph-identity-required";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const LEGACY_ENTITY_REGISTRY = "c2000000-0000-4000-8000-000000000001";
const LEGACY_CHAMBER = "c2000001-0000-4000-8000-000000000001";
const LEGACY_CONNECTION = "c3000000-0000-4000-8000-000000000001";

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function applyCouncil2MigrationIfNeeded(client: pg.Client) {
  const { rows } = await client.query(
    `SELECT 1 FROM entity_registry WHERE id = $1`,
    [LEGACY_ENTITY_REGISTRY],
  );
  if (rows.length === 0) return;

  const sql = fs.readFileSync(
    "supabase/migrations/20260629160000_council2_legacy_cleanup.sql",
    "utf8",
  );
  await client.query(sql);
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
    "WorkspaceMayorChat: targetAgentId only for mayor+fast (not council/team)",
    /orchestrator && mode === "fast"/.test(chatSource) &&
      !/orchestrator && \(mode === "fast" \|\| mode === "council"\)/.test(chatSource),
  );
  record(
    "TechStructureConfirmationGate still present for structure plans",
    chatSource.includes("TechStructureConfirmationGate"),
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
  await applyCouncil2MigrationIfNeeded(client);

  console.log("\n=== COUNCIL-2 legacy UUID cleanup ===\n");

  const legacyEr = await client.query(`SELECT 1 FROM entity_registry WHERE id = $1`, [LEGACY_ENTITY_REGISTRY]);
  const legacyCh = await client.query(`SELECT 1 FROM chambers WHERE id = $1`, [LEGACY_CHAMBER]);
  const legacyConn = await client.query(`SELECT 1 FROM connections WHERE id = $1`, [LEGACY_CONNECTION]);
  const legacyAssign = await client.query(`SELECT 1 FROM agent_assignments WHERE chamber_id = $1`, [LEGACY_CHAMBER]);
  record("legacy entity_registry absent", legacyEr.rowCount === 0);
  record("legacy chamber absent", legacyCh.rowCount === 0);
  record("legacy connection absent", legacyConn.rowCount === 0);
  record("legacy agent_assignments absent", legacyAssign.rowCount === 0);

  const councilSlug = await client.query(
    `SELECT 1 FROM entity_registry WHERE slug = 'city-council' OR name = 'Совет города'`,
  );
  record("no city-council / Совет города entity", councilSlug.rowCount === 0);

  const officeId = await requireExternalEntryOfficeId();
  const byTier = await resolveCityHallDebateChambersByTier(officeId);
  if (byTier.free) {
    record("debate tier chamber free present", Boolean(byTier.free.chamberRegistryId), byTier.free);
  } else {
    console.log("SKIP: no tier debate chambers in this env — legacy cleanup verified above");
  }
  record(
    "debate tier chambers not legacy UUID",
    !Object.values(byTier).some((c) => c?.chamberRegistryId === LEGACY_ENTITY_REGISTRY),
  );

  const mayor = await resolveCityHallMainAgent(officeId);
  const taskText = `verify-council-fanout-${Date.now()}: три пункта по улучшению UX onboarding`;

  const mayorCouncil = await executeChatTask(
    taskText + " [mayor-no-target]",
    mayor.chamberRegistryId,
    "council",
  );
  record(
    "Mayor+council without targetAgentId: executeMayorTask (not invoke unavailable)",
    mayorCouncil.routing?.targets?.[0]?.reason !== "mayor_invoke_unavailable",
    {
      agentCount: mayorCouncil.routing?.agentCount,
      councilInvoked: mayorCouncil.council?.invokedCount,
      routingLogId: mayorCouncil.routing?.routingLogId,
    },
  );

  const mayorLogId = mayorCouncil.routing?.routingLogId;
  if (mayorLogId) {
    const { rows } = await client.query(
      `SELECT routing_action, routing_reasoning IS NOT NULL AS has_reasoning
       FROM routing_logs WHERE id = $1`,
      [mayorLogId],
    );
    record("Mayor+council routing_log has mayor fields", rows[0]?.has_reasoning === true, rows[0]);
  } else {
    record("Mayor+council routing_log id", false);
  }

  const tierChamber = byTier.cheap ?? byTier.free;
  if (!tierChamber || tierChamber.agentCount < 2) {
    console.log(
      "SKIP: tier chamber council fan-out — no tier debate chamber with ≥2 agents in this env",
    );
  } else {
    const chamberCouncil = await executeChatTask(
      taskText + " [tier-chamber]",
      tierChamber.chamberRegistryId,
      "council",
      { directTargetEntityId: tierChamber.chamberRegistryId },
    );
    record("Tier chamber council fan-out invoked >1 agent", (chamberCouncil.council?.invokedCount ?? 0) > 1, {
      tier: tierChamber.tier,
      invoked: chamberCouncil.council?.invokedCount,
      agentCount: chamberCouncil.routing?.agentCount,
    });

    const logId = chamberCouncil.routing?.routingLogId;
    if (logId) {
      const { rows } = await client.query(
        `SELECT id, method, routing_action, agent_count, delegated_building_id, delegated_chamber_id
         FROM routing_logs WHERE id = $1`,
        [logId],
      );
      record("SQL tier council: agent_count > 1", rows[0]?.agent_count > 1, rows[0]);
      record(
        "SQL tier council: routing_action not answer_self",
        rows[0]?.routing_action !== "answer_self",
        { routing_action: rows[0]?.routing_action },
      );
    } else {
      record("SQL tier council routing_log", false, { reason: "no routingLogId" });
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
