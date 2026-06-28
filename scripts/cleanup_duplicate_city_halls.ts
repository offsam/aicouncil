/**
 * Remove empty duplicate City Hall buildings (keeps the one with departments).
 * Verifies chambers, agent_assignments, and connections before delete.
 * Run: npx tsx scripts/cleanup_duplicate_city_halls.ts
 */
import * as fs from "fs";
import pg from "pg";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

type CityHallRow = {
  id: string;
  label: string;
  created_at: string;
  chamber_count: string;
  assignment_count: string;
  connection_count: string;
};

async function listCityHalls(client: pg.Client, officeId: string): Promise<CityHallRow[]> {
  const { rows } = await client.query<CityHallRow>(
    `
    SELECT
      o.id,
      o.label,
      o.created_at,
      COUNT(DISTINCT c.id)::text AS chamber_count,
      COUNT(DISTINCT aa.id)::text AS assignment_count,
      COUNT(DISTINCT conn.id)::text AS connection_count
    FROM office_objects o
    LEFT JOIN chambers c
      ON c.building_object_id = o.id OR c.building_entity_id = o.id
    LEFT JOIN agent_assignments aa ON aa.chamber_id = c.id
    LEFT JOIN connections conn
      ON conn.source_entity_id = o.id OR conn.target_entity_id = o.id
    WHERE o.office_id = $1
      AND o.object_type = 'room'
      AND TRIM(o.label) = 'City Hall'
    GROUP BY o.id, o.label, o.created_at
    ORDER BY COUNT(DISTINCT c.id) DESC, o.created_at ASC
    `,
    [officeId],
  );
  return rows;
}

function isCityHallEmpty(row: CityHallRow): boolean {
  return (
    Number(row.chamber_count) === 0 &&
    Number(row.assignment_count) === 0 &&
    Number(row.connection_count) === 0
  );
}

async function main() {
  const ref =
    process.env.SUPABASE_PROJECT_REF ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) {
    console.error("Need SUPABASE_DB_PASSWORD in .env.local");
    process.exit(1);
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

  const officeId = AI_COUNCIL_OFFICE_ID;

  console.log("=== BEFORE ===");
  const before = await listCityHalls(client, officeId);
  console.table(
    before.map((row) => ({
      id: row.id,
      label: row.label,
      chambers: row.chamber_count,
      assignments: row.assignment_count,
      connections: row.connection_count,
      created_at: row.created_at,
    })),
  );
  console.log(`City Hall count: ${before.length}`);

  if (before.length <= 1) {
    console.log("\nNo duplicate City Hall buildings — nothing to delete.");
    console.log("\n=== AFTER ===");
    console.table(
      before.map((row) => ({
        id: row.id,
        label: row.label,
        chambers: row.chamber_count,
      })),
    );
    await client.end();
    return;
  }

  const keep = before[0]!;
  const candidates = before.slice(1);
  console.log("\nKeep:", keep.id, `(chambers=${keep.chamber_count})`);

  for (const dup of candidates) {
    if (!isCityHallEmpty(dup)) {
      console.warn(
        "SKIP (not empty):",
        dup.id,
        `chambers=${dup.chamber_count}, assignments=${dup.assignment_count}, connections=${dup.connection_count}`,
      );
      continue;
    }

    console.log("Delete empty duplicate:", dup.id);

    await client.query(
      `UPDATE connections SET target_entity_id = $1 WHERE target_entity_id = $2`,
      [keep.id, dup.id],
    );
    await client.query(
      `UPDATE connections SET source_entity_id = $1 WHERE source_entity_id = $2`,
      [keep.id, dup.id],
    );
    await client.query(`DELETE FROM entity_registry WHERE id = $1`, [dup.id]);
    await client.query(`DELETE FROM office_objects WHERE id = $1`, [dup.id]);
  }

  console.log("\n=== AFTER ===");
  const after = await listCityHalls(client, officeId);
  console.table(
    after.map((row) => ({
      id: row.id,
      label: row.label,
      chambers: row.chamber_count,
      assignments: row.assignment_count,
      connections: row.connection_count,
    })),
  );
  console.log(`City Hall count: ${after.length}`);

  await client.end();
  console.log("\nDone. Refresh workspace canvas.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
