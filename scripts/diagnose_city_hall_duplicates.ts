import * as fs from "fs";
import pg from "pg";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https:\/\/([^.]+)/)![1];
const OFFICE = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

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

  console.log("=== 1. office_objects City Hall ===");
  const objs = await client.query(
    `
    SELECT id, label, object_type, office_id, position_x, position_z, size_w, size_d, created_at
    FROM office_objects
    WHERE office_id = $1
      AND object_type = 'room'
      AND TRIM(label) = 'City Hall'
    ORDER BY created_at ASC
    `,
    [OFFICE],
  );
  console.table(objs.rows);

  console.log("\n=== 2. entity_registry for each office_object id (building) ===");
  const reg = await client.query(
    `
    SELECT er.id, er.entity_type, er.name, er.slug, er.parent_entity_id, er.created_at,
           o.label AS office_object_label
    FROM entity_registry er
    LEFT JOIN office_objects o ON o.id = er.id
    WHERE er.id IN (
      SELECT id FROM office_objects
      WHERE office_id = $1 AND object_type = 'room' AND TRIM(label) = 'City Hall'
    )
    OR (er.parent_entity_id IN (
      SELECT id FROM office_objects
      WHERE office_id = $1 AND object_type = 'room' AND TRIM(label) = 'City Hall'
    ) AND er.entity_type = 'building')
    ORDER BY er.created_at ASC
    `,
    [OFFICE],
  );
  console.table(reg.rows);

  console.log("\n=== 3. chambers per City Hall building_object_id ===");
  const chambers = await client.query(
    `
    SELECT c.id, c.name, c.routing_role, c.building_object_id, c.building_entity_id,
           c.entity_registry_id, c.created_at,
           o.label AS building_label
    FROM chambers c
    JOIN office_objects o ON o.id = c.building_object_id
    WHERE o.office_id = $1
      AND TRIM(o.label) = 'City Hall'
    ORDER BY c.building_object_id, c.created_at ASC
    `,
    [OFFICE],
  );
  console.table(chambers.rows);

  console.log("\n=== 4. agent_assignments count per City Hall building ===");
  const agents = await client.query(
    `
    SELECT o.id AS building_object_id, o.created_at AS building_created_at,
           COUNT(DISTINCT c.id) AS chamber_count,
           COUNT(aa.id) AS assignment_count,
           COUNT(DISTINCT aa.agent_id) AS distinct_agents
    FROM office_objects o
    LEFT JOIN chambers c ON c.building_object_id = o.id
    LEFT JOIN agent_assignments aa ON aa.chamber_id = c.id
    WHERE o.office_id = $1
      AND o.object_type = 'room'
      AND TRIM(o.label) = 'City Hall'
    GROUP BY o.id, o.created_at
    ORDER BY o.created_at ASC
    `,
    [OFFICE],
  );
  console.table(agents.rows);

  console.log("\n=== 5. connections touching City Hall buildings ===");
  const conns = await client.query(
    `
    SELECT c.id, c.source_entity_id, c.target_entity_id, c.is_active, c.created_at,
           src.name AS source_name, tgt.name AS target_name
    FROM connections c
    LEFT JOIN entity_registry src ON src.id = c.source_entity_id
    LEFT JOIN entity_registry tgt ON tgt.id = c.target_entity_id
    WHERE c.source_entity_id IN (
      SELECT id FROM office_objects WHERE office_id = $1 AND TRIM(label) = 'City Hall'
    )
    OR c.target_entity_id IN (
      SELECT id FROM office_objects WHERE office_id = $1 AND TRIM(label) = 'City Hall'
    )
    ORDER BY c.created_at ASC
    `,
    [OFFICE],
  );
  console.table(conns.rows);

  console.log("\n=== 6. Any entity_registry slug city-hall (may differ from office_object id) ===");
  const slugRows = await client.query(
    `
    SELECT er.id, er.name, er.slug, er.entity_type, er.parent_entity_id, er.created_at,
           o.id AS linked_office_object_id, o.label
    FROM entity_registry er
    LEFT JOIN office_objects o ON o.id = er.id
    WHERE er.slug = 'city-hall'
       OR er.name ILIKE '%city hall%'
    ORDER BY er.created_at ASC
    `,
  );
  console.table(slugRows.rows);

  console.log("\n=== 7. workspace meta city_hall (offices table) ===");
  const meta = await client.query(
    `SELECT id, name, meta FROM offices WHERE id = $1`,
    [OFFICE],
  );
  console.log("office meta keys:", meta.rows[0]?.meta ? Object.keys(meta.rows[0].meta) : null);
  console.log("city_hall layout:", JSON.stringify(meta.rows[0]?.meta?.city_hall ?? null));

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
