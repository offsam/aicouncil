import * as fs from "fs";
import pg from "pg";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const ref =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
const password = process.env.SUPABASE_DB_PASSWORD || process.argv[2];

if (!ref || !password) {
  console.error("Usage: SUPABASE_DB_PASSWORD=... npx tsx scripts/apply_sprint5_pg.ts");
  process.exit(1);
}

const sqlPath = "supabase/migrations/20250622600000_sprint5_workflows.sql";
const sql = fs.readFileSync(sqlPath, "utf8");

async function main() {
  const client = new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: "postgres",
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });

  console.log(`Applying ${sqlPath} to db.${ref}.supabase.co ...`);
  await client.connect();
  await client.query(sql);
  const check = await client.query(
    "SELECT to_regclass('public.workflows') AS workflows, to_regclass('public.workflow_steps') AS workflow_steps",
  );
  console.log("Verification:", check.rows[0]);
  await client.end();
  console.log("Sprint 5 migration applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
