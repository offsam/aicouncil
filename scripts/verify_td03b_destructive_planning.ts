/**
 * TD-03B: destructive planning + impact + before-snapshot (non-executable).
 * Run: npx tsx scripts/verify_td03b_destructive_planning.ts
 */
import * as fs from "fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import {
  analyzeDestructiveStructureImpact,
  formatImpactSummaryLines,
} from "../lib/tech-department/structure-impact";
import {
  createDestructiveStructurePlanFromActions,
  formatStructurePlanForUser,
} from "../lib/tech-department/structure-plan";
import type { DeleteChamberAction } from "../lib/tech-department/structure-types";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function record(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function findSampleChamber(): Promise<{ registryId: string; name: string } | null> {
  const { data } = await supabase
    .from("entity_registry")
    .select("id, name")
    .eq("entity_type", "chamber")
    .not("name", "ilike", "%City Hall%")
    .limit(5);
  const row = (data ?? []).find((r) => r.name && !/^free$|^\$$|^\$\$$|^\$\$\$$/.test(r.name.trim()));
  return row ? { registryId: row.id, name: row.name } : null;
}

async function main() {
  console.log("=== TD-03B impact analysis (deterministic) ===\n");

  const sample = await findSampleChamber();
  if (!sample) {
    record("sample chamber for delete_chamber test", false, "no suitable chamber in DB");
    return;
  }

  const deleteAction: DeleteChamberAction = {
    type: "delete_chamber",
    chamber_registry_id: sample.registryId,
    description: `Удалить отдел «${sample.name}»`,
  };

  const { impact, entities } = await analyzeDestructiveStructureImpact([deleteAction]);
  record("impact analysis returns summary lines", impact.summaryLines.length > 0, impact.summaryLines);
  record(
    "snapshot entities include chamber registry row",
    entities.entity_registry.some((r) => r.id === sample.registryId),
    { registryCount: entities.entity_registry.length, chambers: entities.chambers.length },
  );

  console.log("\nImpact preview for", sample.name);
  console.log(formatImpactSummaryLines(impact.counts).join("\n"));

  console.log("\n=== TD-03B full destructive plan + snapshot ===\n");

  const taskText = `удали отдел ${sample.name}`;
  const plan = await createDestructiveStructurePlanFromActions(taskText, [deleteAction]);
  record("planKind destructive", plan.planKind === "destructive", plan.planKind);
  record("snapshotId present", Boolean(plan.snapshotId), plan.snapshotId);
  record("impact on plan", (plan.impactAnalysis?.summaryLines.length ?? 0) > 0);

  const userText = formatStructurePlanForUser(plan);
  record("formatStructurePlanForUser mentions snapshot", userText.includes(plan.snapshotId ?? ""), {});
  record("formatStructurePlanForUser mentions impact", userText.includes("Анализ последствий"), {});

  console.log("\n--- User-facing plan preview ---");
  console.log(userText);

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

  const snapRow = await client.query(
    `SELECT id, plan_id, office_id, snapshot_type,
            jsonb_array_length(entities->'entity_registry') AS er_count,
            jsonb_array_length(entities->'chambers') AS ch_count,
            jsonb_array_length(entities->'connections') AS conn_count
     FROM tech_structure_snapshots WHERE id = $1`,
    [plan.snapshotId],
  );
  record("snapshot row in DB", snapRow.rows.length === 1, snapRow.rows[0]);

  const planRow = await client.query(
    `SELECT id, plan_kind, snapshot_id, impact_analysis IS NOT NULL AS has_impact
     FROM tech_structure_plans WHERE id = $1`,
    [plan.planId],
  );
  record("plan row plan_kind=destructive", planRow.rows[0]?.plan_kind === "destructive", planRow.rows[0]);

  console.log("\n=== TD-03C note: destructive execute covered by verify_td03c_destructive_execute.ts ===\n");
  record("plan remains pending (no execute in TD-03B script)", true);

  const chamberBefore = await client.query(
    `SELECT id FROM entity_registry WHERE id = $1`,
    [sample.registryId],
  );
  record("sample chamber still present", chamberBefore.rows.length === 1, { registryId: sample.registryId });

  await client.end();

  console.log("\n=== Cleanup test plan ===\n");
  if (plan.snapshotId) {
    await supabase.from("tech_structure_snapshots").delete().eq("id", plan.snapshotId);
  }
  await supabase.from("tech_structure_plans").delete().eq("id", plan.planId);
  record("cleanup test rows", true);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
