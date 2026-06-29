/**
 * TD-03C: atomic Postgres RPC destructive structure execute.
 * Run: npx tsx scripts/verify_td03c_destructive_execute.ts
 */
import * as fs from "fs";
import pg from "pg";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import { executeTechStructurePlan } from "../lib/tech-department/structure-execute";
import { analyzeDestructiveStructureImpact } from "../lib/tech-department/structure-impact";
import { createDestructiveStructurePlanFromActions } from "../lib/tech-department/structure-plan";
import { requireExternalEntryOfficeId } from "../lib/workspace/graph-identity-required";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function applyRpcMigrationIfNeeded(client: pg.Client) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_proc WHERE proname = 'execute_destructive_structure_plan'`,
  );
  if (rows.length > 0) return;
  const sql = fs.readFileSync(
    "supabase/migrations/20260629150000_execute_destructive_structure_plan.sql",
    "utf8",
  );
  await client.query(sql);
}

async function createVerifyBuilding(sb: ReturnType<typeof getSupabaseAdmin>, officeId: string) {
  const label = `TD03C Verify ${Date.now()}`;
  const { data: obj, error: objErr } = await sb
    .from("office_objects")
    .insert({
      office_id: officeId,
      object_type: "room",
      position_x: 40,
      position_z: 40,
      size_w: 12,
      size_d: 10,
      label,
      color: "slate",
    })
    .select("id, label")
    .single();
  if (objErr || !obj) throw objErr ?? new Error("office_objects insert failed");

  const { error: regErr } = await sb.from("entity_registry").insert({
    id: obj.id,
    entity_type: "building",
    name: label,
    slug: `td03c-${obj.id.slice(0, 8)}`,
    parent_entity_id: officeId,
    routing_description: "TD-03C verify building",
  });
  if (regErr) throw regErr;

  const { data: chamberReg, error: chRegErr } = await sb
    .from("entity_registry")
    .insert({
      entity_type: "chamber",
      name: "TD03C Main",
      slug: `td03c-main-${Date.now()}`,
      parent_entity_id: obj.id,
    })
    .select("id")
    .single();
  if (chRegErr || !chamberReg) throw chRegErr ?? new Error("chamber registry failed");

  const { data: chamber, error: chErr } = await sb
    .from("chambers")
    .insert({
      entity_registry_id: chamberReg.id,
      building_entity_id: obj.id,
      building_object_id: obj.id,
      name: "TD03C Main",
      x: 2,
      z: 2,
      width: 4,
      depth: 4,
      routing_role: "main",
    })
    .select("id")
    .single();
  if (chErr || !chamber) throw chErr ?? new Error("chamber insert failed");

  const { data: agentRow } = await sb
    .from("agents")
    .select("id")
    .eq("office_id", officeId)
    .limit(1)
    .maybeSingle();

  if (agentRow) {
    await sb.from("agent_assignments").insert({
      agent_id: agentRow.id,
      chamber_id: chamber.id,
      role: "member",
    });
  }

  return {
    buildingId: obj.id,
    chamberRegistryId: chamberReg.id,
    chamberRowId: chamber.id,
    label,
  };
}

async function countBuildingArtifacts(
  client: pg.Client,
  buildingId: string,
): Promise<{
  entity_registry: number;
  office_objects: number;
  chambers: number;
  agent_assignments: number;
}> {
  const er = await client.query(`SELECT COUNT(*)::int AS n FROM entity_registry WHERE id = $1 OR parent_entity_id = $1`, [
    buildingId,
  ]);
  const oo = await client.query(`SELECT COUNT(*)::int AS n FROM office_objects WHERE id = $1`, [buildingId]);
  const ch = await client.query(
    `SELECT COUNT(*)::int AS n FROM chambers WHERE building_entity_id = $1 OR building_object_id = $1`,
    [buildingId],
  );
  const aa = await client.query(
    `SELECT COUNT(*)::int AS n FROM agent_assignments aa
     JOIN chambers c ON c.id = aa.chamber_id
     WHERE c.building_entity_id = $1 OR c.building_object_id = $1`,
    [buildingId],
  );
  return {
    entity_registry: er.rows[0]?.n ?? 0,
    office_objects: oo.rows[0]?.n ?? 0,
    chambers: ch.rows[0]?.n ?? 0,
    agent_assignments: aa.rows[0]?.n ?? 0,
  };
}

async function main() {
  const sb = getSupabaseAdmin();
  const officeId = await requireExternalEntryOfficeId();
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
  await applyRpcMigrationIfNeeded(client);

  console.log("=== Static: migration + executor wiring ===\n");
  record("RPC migration file exists", fs.existsSync("supabase/migrations/20260629150000_execute_destructive_structure_plan.sql"));
  const execSrc = fs.readFileSync("lib/tech-department/structure-execute.ts", "utf8");
  record("execute calls supabase.rpc", execSrc.includes('rpc("execute_destructive_structure_plan"'));
  record("501 block removed", !execSrc.includes("Destructive execution is not implemented yet"));
  const impactSrc = fs.readFileSync("lib/tech-department/structure-impact.ts", "utf8");
  record("impact includes chamber_archive label", impactSrc.includes("chamber_archive"));

  console.log("\n=== chamber_archive in impact wording ===\n");
  const { impact } = await analyzeDestructiveStructureImpact([
    {
      type: "delete_chamber",
      chamber_registry_id: "00000000-0000-4000-8000-000000000099",
      description: "dry-run",
    },
  ]);
  record(
    "impact counts type includes chamber_archive key",
    "chamber_archive" in impact.counts,
    Object.keys(impact.counts),
  );

  console.log("\n=== Live: create building → destructive execute → SQL verify ===\n");

  const agentsBefore = await client.query(`SELECT COUNT(*)::int AS n FROM agents`);
  const agentsCountBefore = agentsBefore.rows[0]?.n ?? 0;

  const fixture = await createVerifyBuilding(sb, officeId);
  const beforeCounts = await countBuildingArtifacts(client, fixture.buildingId);
  record("fixture has entity_registry rows", beforeCounts.entity_registry >= 2, beforeCounts);
  record("fixture has office_objects row", beforeCounts.office_objects === 1, beforeCounts);
  record("fixture has chamber row", beforeCounts.chambers === 1, beforeCounts);
  record("fixture has assignment", beforeCounts.agent_assignments >= 1, beforeCounts);

  const destructivePlan = await createDestructiveStructurePlanFromActions(
    `удали здание ${fixture.label}`,
    [
      {
        type: "delete_building",
        building_id: fixture.buildingId,
        description: `Удалить здание ${fixture.label}`,
      },
    ],
  );

  const result = await executeTechStructurePlan(destructivePlan.planId);
  record("destructive execute succeeds", result.executed.every((s) => s.ok), result.executed);

  const afterCounts = await countBuildingArtifacts(client, fixture.buildingId);
  record("entity_registry cleaned", afterCounts.entity_registry === 0, afterCounts);
  record("office_objects cleaned", afterCounts.office_objects === 0, afterCounts);
  record("chambers cleaned", afterCounts.chambers === 0, afterCounts);
  record("agent_assignments cleaned", afterCounts.agent_assignments === 0, afterCounts);

  const { data: planAfter } = await sb
    .from("tech_structure_plans")
    .select("status, execution_result")
    .eq("id", destructivePlan.planId)
    .single();
  record("plan status executed", planAfter?.status === "executed", planAfter);
  record(
    "execution_result planKind destructive",
    (planAfter?.execution_result as { planKind?: string })?.planKind === "destructive",
    planAfter?.execution_result,
  );

  const agentsAfter = await client.query(`SELECT COUNT(*)::int AS n FROM agents`);
  record("agents table count unchanged", agentsAfter.rows[0]?.n === agentsCountBefore, {
    before: agentsCountBefore,
    after: agentsAfter.rows[0]?.n,
  });

  console.log("\n=== Atomicity: invalid action rolls back prior step ===\n");

  const rollbackFixture = await createVerifyBuilding(sb, officeId);
  const { error: rpcFailError } = await sb.rpc("execute_destructive_structure_plan", {
    actions: [
      { type: "delete_building", building_id: rollbackFixture.buildingId },
      { type: "delete_agent", agent_id: "00000000-0000-4000-8000-000000000001" },
    ],
  });
  record(
    "RPC error on invalid action type",
    Boolean(rpcFailError) && rpcFailError.message.includes("unsupported destructive action type"),
    rpcFailError?.message,
  );

  const rollbackCounts = await countBuildingArtifacts(client, rollbackFixture.buildingId);
  record("rollback: building still present after failed RPC", rollbackCounts.office_objects === 1, rollbackCounts);

  console.log("\n=== Regression: create execute unchanged ===\n");

  const createLabel = `TD03C Create ${Date.now()}`;
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  const { data: createPlanRow } = await sb
    .from("tech_structure_plans")
    .insert({
      task_text: "td03c create regression",
      plan_summary: "single building",
      actions: [
        {
          type: "create_building",
          description: "create",
          label: createLabel,
          routing_description: "td03c regression",
          ref: "$b1",
        },
      ],
      status: "pending",
      expires_at: expiresAt,
      plan_kind: "create",
    })
    .select("id")
    .single();

  let createBuildingId: string | null = null;
  try {
    const createResult = await executeTechStructurePlan(createPlanRow!.id);
    record("create execute still works", createResult.executed.every((s) => s.ok), createResult.executed);
    const { data: created } = await sb
      .from("office_objects")
      .select("id")
      .eq("label", createLabel)
      .maybeSingle();
    createBuildingId = created?.id ?? null;
    record("create building row exists", Boolean(createBuildingId), createBuildingId);
  } finally {
    if (createBuildingId) {
      await client.query(`DELETE FROM entity_registry WHERE id = $1`, [createBuildingId]);
      await client.query(`DELETE FROM office_objects WHERE id = $1`, [createBuildingId]);
    }
    await sb.from("tech_structure_plans").delete().eq("id", createPlanRow!.id);
  }

  console.log("\n=== Cleanup ===\n");
  if (destructivePlan.snapshotId) {
    await sb.from("tech_structure_snapshots").delete().eq("id", destructivePlan.snapshotId);
  }
  await sb.from("tech_structure_plans").delete().eq("id", destructivePlan.planId);

  if (rollbackCounts.office_objects === 1) {
    await client.query(`DELETE FROM entity_registry WHERE id = $1`, [rollbackFixture.buildingId]);
    await client.query(`DELETE FROM office_objects WHERE id = $1`, [rollbackFixture.buildingId]);
  }

  await client.end();
  record("cleanup complete", true);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
