import * as fs from "fs";
import pg from "pg";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https:\/\/([^.]+)/)![1];
const sqlPath =
  process.argv[2] || "supabase/migrations/20250622900000_agent_assignment_layout.sql";
const sql = fs.readFileSync(sqlPath, "utf8");

async function main() {
  const client = new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: "postgres",
    password: process.env.SUPABASE_DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });

  console.log(`Applying ${sqlPath} to db.${ref}.supabase.co ...`);
  await client.connect();
  await client.query(sql);
  const check = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='agent_assignments' AND column_name IN ('layout_x','layout_y') ORDER BY column_name",
  );
  console.log("Columns:", check.rows);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
