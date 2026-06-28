/**
 * P0-3: Verify chamber coordinate invariant (building-local ↔ city world ↔ use mode).
 * Run: npx tsx scripts/verify_chamber_coords.ts
 */
import * as fs from "fs";
import pg from "pg";
import {
  chamberCityUsePositionsMatch,
  getChamberLocalPosition,
  getChamberWorldPosition,
  getBuildingMapPosition,
} from "../lib/floor-chamber-position";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function testFixtures() {
  const building = { position_x: 12, position_z: -8 };
  const chamber = { x: 2.5, z: -1 };

  const local = getChamberLocalPosition(chamber);
  const world = getChamberWorldPosition(building, chamber);
  const b = getBuildingMapPosition(building);

  if (local.x !== 2.5 || local.z !== -1) {
    throw new Error(`local mismatch: ${JSON.stringify(local)}`);
  }
  if (world.x !== 14.5 || world.z !== -9) {
    throw new Error(`world mismatch: ${JSON.stringify(world)}`);
  }
  if (!chamberCityUsePositionsMatch(building, chamber)) {
    throw new Error("invariant failed on fixture");
  }
  if (world.x - b.x !== local.x || world.z - b.z !== local.z) {
    throw new Error("world - building !== local (Use Mode must render at local coords)");
  }

  console.log("Fixture OK:", { local, world, buildingOrigin: b });
}

async function testDatabaseSample() {
  const ref =
    process.env.SUPABASE_PROJECT_REF ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) {
    console.log("Skip DB sample (no SUPABASE_DB_PASSWORD)");
    return;
  }

  const client = new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: "postgres",
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const rows = await client.query<{
    name: string;
    x: string;
    z: string;
    position_x: string;
    position_z: string;
  }>(`
    SELECT c.name, c.x, c.z, o.position_x, o.position_z
    FROM chambers c
    JOIN office_objects o ON o.id = c.building_object_id
    ORDER BY c.created_at DESC
    LIMIT 10
  `);

  let checked = 0;
  for (const row of rows.rows) {
    const building = { position_x: row.position_x, position_z: row.position_z };
    const chamber = { x: row.x, z: row.z };
    if (!chamberCityUsePositionsMatch(building, chamber)) {
      throw new Error(`DB invariant failed for chamber ${row.name}`);
    }
    const local = getChamberLocalPosition(chamber);
    const world = getChamberWorldPosition(building, chamber);
    console.log(`  ${row.name}: local=(${local.x}, ${local.z}) world=(${world.x}, ${world.z})`);
    checked++;
  }

  await client.end();
  console.log(`DB sample OK (${checked} chambers)`);
}

async function main() {
  testFixtures();
  await testDatabaseSample();
  console.log("\n✅ Chamber coordinate verification passed");
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err);
  process.exit(1);
});
