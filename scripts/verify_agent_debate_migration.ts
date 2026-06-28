import * as fs from "fs";
import pg from "pg";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https:\/\/([^.]+)/)![1];

async function main() {
  const client = new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: "postgres",
    password: process.env.SUPABASE_DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('agent_debates','agent_debate_rounds') ORDER BY 1",
  );
  console.log("TABLES:", tables.rows);

  const council = await client.query(`
    SELECT er.id, er.name, er.slug, er.entity_type, c.routing_role, c.id AS chamber_id
    FROM entity_registry er
    LEFT JOIN chambers c ON c.entity_registry_id = er.id
    WHERE er.slug = 'city-council' OR er.name = 'Совет города'
  `);
  console.log("COUNCIL:", JSON.stringify(council.rows, null, 2));

  const cityHallChambers = await client.query(`
    SELECT c.id, c.name, c.routing_role, c.entity_registry_id
    FROM chambers c
    JOIN office_objects o ON o.id = c.building_object_id
    WHERE TRIM(o.label) = 'City Hall'
    ORDER BY c.created_at
  `);
  console.log("CITY_HALL_CHAMBERS:", JSON.stringify(cityHallChambers.rows, null, 2));

  const fixedId = await client.query(
    "SELECT id, entity_type, name, slug FROM entity_registry WHERE id = 'c2000000-0000-4000-8000-000000000001'",
  );
  console.log("FIXED_ID_ROW:", fixedId.rows);

  const assignments = await client.query(`
    SELECT aa.agent_id, a.name, a.cost_tier
    FROM agent_assignments aa
    JOIN agents a ON a.id = aa.agent_id
    WHERE aa.chamber_id = 'c2000001-0000-4000-8000-000000000001'
    ORDER BY a.cost_tier, a.name
  `);
  console.log("COUNCIL_ROSTER:", JSON.stringify(assignments.rows, null, 2));

  const debateCols = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('agent_debates', 'agent_debate_rounds')
    ORDER BY table_name, ordinal_position
  `);
  console.log("DEBATE_SCHEMA_COLUMNS:", debateCols.rowCount);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
