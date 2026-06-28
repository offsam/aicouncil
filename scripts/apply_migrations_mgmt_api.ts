import * as fs from "fs";
import { execSync } from "child_process";

const PROJECT_REF = process.argv[2] || "hgiocqxhyhvmkalpgnzk";
const MIGRATION_FILE = process.argv[3];

function getToken(): string {
  return execSync('security find-generic-password -s "Supabase CLI" -w', { encoding: "utf8" }).trim();
}

async function runSql(query: string): Promise<unknown> {
  const token = getToken();
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SQL failed (${res.status}): ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  if (MIGRATION_FILE) {
    const sql = fs.readFileSync(MIGRATION_FILE, "utf8");
    console.log(`Applying ${MIGRATION_FILE} to ${PROJECT_REF}...`);
    const result = await runSql(sql);
    console.log(JSON.stringify(result, null, 2).slice(0, 2000));
    return;
  }

  const dir = "supabase/migrations";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    console.log(`\n=== ${file} ===`);
    const sql = fs.readFileSync(`${dir}/${file}`, "utf8");
    try {
      await runSql(sql);
      console.log("OK");
    } catch (err) {
      console.error(String(err));
      process.exit(1);
    }
  }
  console.log("\nAll migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
