import * as fs from "fs";
import pg from "pg";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)/)![1];
const key = env.SUPABASE_SERVICE_ROLE_KEY;

const attempts = [
  `postgresql://postgres:${encodeURIComponent(key)}@db.${ref}.supabase.co:5432/postgres`,
  `postgresql://postgres.${ref}:${encodeURIComponent(key)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
];

async function tryConnect(url: string) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const r = await client.query("SELECT 1 AS ok");
    console.log("OK:", url.replace(key, "***"), r.rows);
    await client.end();
    return true;
  } catch (e) {
    console.log("FAIL:", (e as Error).message.slice(0, 120));
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

async function main() {
  for (const url of attempts) {
    await tryConnect(url);
  }
}

main().catch(console.error);
