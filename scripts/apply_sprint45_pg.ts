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
  console.error("Usage: SUPABASE_DB_PASSWORD=... npx tsx scripts/apply_sprint45_pg.ts");
  console.error("Or: npx tsx scripts/apply_sprint45_pg.ts <db-password>");
  process.exit(1);
}

const sqlPath = "supabase/migrations/20250622500000_sprint45_technical_debt.sql";
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
    "SELECT to_regclass('public.agent_assignments') AS tbl, (SELECT count(*) FROM information_schema.columns WHERE table_name='rules' AND column_name='entity_registry_id' AND is_nullable='NO') AS rules_not_null",
  );
  console.log("Verification:", check.rows[0]);
  await client.end();
  console.log("Migration applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
