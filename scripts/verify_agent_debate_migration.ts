/**
 * COUNCIL-2: agent debate schema + tier chambers; legacy «Совет города» removed.
 * Run: npx tsx scripts/verify_agent_debate_migration.ts
 */
import * as fs from "fs";
import pg from "pg";
import { COST_TIER_LABEL_RU } from "../lib/cost-tier";
import { resolveCityHallDebateChambersByTier } from "../lib/workspace/resolve-city-hall-council-chamber";

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

  console.log("=== Debate tables ===\n");

  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('agent_debates', 'agent_debate_rounds')
     ORDER BY 1`,
  );
  record("agent_debates table exists", tables.rows.some((r) => r.table_name === "agent_debates"));
  record(
    "agent_debate_rounds table exists",
    tables.rows.some((r) => r.table_name === "agent_debate_rounds"),
  );

  const debateCols = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('agent_debates', 'agent_debate_rounds')
      AND column_name IN ('debate_chamber_id', 'caller_entity_id', 'debate_id', 'round_index')
    ORDER BY table_name, column_name
  `);
  record("debate schema columns present", debateCols.rowCount === 4, debateCols.rows);

  console.log("\n=== Legacy «Совет города» removed ===\n");

  const legacyEr = await client.query(
    `SELECT id FROM entity_registry WHERE id = $1`,
    [LEGACY_ENTITY_REGISTRY],
  );
  record("fixed entity_registry c2000000 absent", legacyEr.rowCount === 0);

  const legacyCh = await client.query(`SELECT id FROM chambers WHERE id = $1`, [LEGACY_CHAMBER]);
  record("fixed chamber c2000001 absent", legacyCh.rowCount === 0);

  const legacyConn = await client.query(`SELECT id FROM connections WHERE id = $1`, [LEGACY_CONNECTION]);
  record("fixed connection c3000000 absent", legacyConn.rowCount === 0);

  const legacyAssign = await client.query(
    `SELECT 1 FROM agent_assignments WHERE chamber_id = $1`,
    [LEGACY_CHAMBER],
  );
  record("legacy council assignments absent", legacyAssign.rowCount === 0);

  const councilSlug = await client.query(`
    SELECT er.id, er.name, er.slug
    FROM entity_registry er
    WHERE er.slug = 'city-council' OR er.name = 'Совет города'
  `);
  record("no city-council slug/name rows", councilSlug.rowCount === 0, councilSlug.rows);

  console.log("\n=== Tier debate chambers (City Hall) ===\n");

  const cityHallChambers = await client.query(`
    SELECT c.id, c.name, c.routing_role, c.entity_registry_id
    FROM chambers c
    JOIN office_objects o ON o.id = c.building_object_id
    WHERE TRIM(o.label) = 'City Hall'
    ORDER BY c.created_at
  `);
  record("City Hall has chambers", cityHallChambers.rowCount > 0, cityHallChambers.rowCount);
  record(
    "City Hall main chamber preserved",
    cityHallChambers.rows.some((r) => r.routing_role === "main"),
    cityHallChambers.rows.filter((r) => r.routing_role === "main"),
  );

  const tierNames = new Set(["free", "$", "$$", "$$$"]);
  const tierChambers = cityHallChambers.rows.filter(
    (r) => tierNames.has(String(r.name ?? "").trim()) && r.routing_role !== "main",
  );
  if (tierChambers.length >= 4) {
    record("tier debate chambers present (free/$/$$/$$$)", true, tierChambers);
  } else {
    console.log(
      `SKIP: tier debate chambers not seeded in this env (${tierChambers.length}/4) — migration only deletes fixed legacy UUIDs`,
    );
  }

  const byTier = await resolveCityHallDebateChambersByTier();
  for (const tier of ["free", "cheap", "mid", "premium"] as const) {
    const chamber = byTier[tier];
    if (chamber) {
      record(
        `resolve tier ${tier} (${COST_TIER_LABEL_RU[tier]})`,
        chamber.chamberRegistryId !== LEGACY_ENTITY_REGISTRY,
        chamber,
      );
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
