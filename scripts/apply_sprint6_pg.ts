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
  console.error("Usage: SUPABASE_DB_PASSWORD=... npx tsx scripts/apply_sprint6_pg.ts");
  process.exit(1);
}

const sqlPath = "supabase/migrations/20250622700000_sprint6_feedback.sql";
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

  console.log(`Applying ${sqlPath} ...`);
  await client.connect();
  await client.query(sql);
  const check = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='routing_logs' AND column_name='outcome'",
  );
  console.log("routing_logs.outcome:", check.rows.length > 0 ? "ok" : "missing");
  await client.end();
  console.log("Sprint 6 migration applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
