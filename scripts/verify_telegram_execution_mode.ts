/**
 * Verify Telegram reads persisted offices.workspace_meta.execution_mode (TG-1).
 * Run: npx tsx scripts/verify_telegram_execution_mode.ts
 */
import * as fs from "fs";
import pg from "pg";
import {
  parseExecutionModeFromWorkspaceMeta,
  resolveOfficeExecutionMode,
} from "../lib/workspace/execution-mode-tiers";
import { requireExternalEntryOfficeId } from "../lib/workspace/graph-identity-required";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function main() {
  const officeId = await requireExternalEntryOfficeId();

  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https:\/\/([^.]+)/)![1];
  const client = new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: "postgres",
    password: process.env.SUPABASE_DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows } = await client.query<{ id: string; workspace_meta: unknown }>(
    `SELECT id, workspace_meta FROM offices WHERE id = $1`,
    [officeId],
  );
  const row = rows[0];
  if (!row) throw new Error(`office not found: ${officeId}`);

  const rawMeta = row.workspace_meta;
  const jsonPath = "workspace_meta.execution_mode";
  const persisted =
    rawMeta && typeof rawMeta === "object"
      ? (rawMeta as Record<string, unknown>).execution_mode
      : undefined;

  console.log("=== Source of truth ===");
  console.log("table: offices");
  console.log(`office_id: ${officeId}`);
  console.log(`JSON path: ${jsonPath}`);
  console.log(`raw workspace_meta.execution_mode: ${JSON.stringify(persisted ?? null)}`);
  console.log(
    "validation: isExecutionMode(value) — fast | team | council; else fallback fast",
  );

  const parsed = parseExecutionModeFromWorkspaceMeta(rawMeta);
  const resolved = await resolveOfficeExecutionMode(officeId);

  console.log("\n=== Resolved execution mode (canvas + Telegram helper) ===");
  console.log(`parseExecutionModeFromWorkspaceMeta → ${parsed}`);
  console.log(`resolveOfficeExecutionMode → ${resolved}`);

  record("parse matches resolveOfficeExecutionMode", parsed === resolved);

  record('fallback {} → fast', parseExecutionModeFromWorkspaceMeta({}) === "fast");
  record(
    'fallback invalid "bogus" → fast',
    parseExecutionModeFromWorkspaceMeta({ execution_mode: "bogus" }) === "fast",
  );
  record(
    'fallback null execution_mode → fast',
    parseExecutionModeFromWorkspaceMeta({ execution_mode: null }) === "fast",
  );
  record(
    'explicit council → council',
    parseExecutionModeFromWorkspaceMeta({ execution_mode: "council" }) === "council",
  );

  console.log("\n=== Live persisted mode ===");
  if (resolved === "council") {
    record("persisted execution_mode is council — Telegram would send council", true);
  } else if (resolved === "team") {
    record("persisted execution_mode is team — Telegram would send team", true);
    console.log("(council live test skipped — set workspace_meta.execution_mode=council on canvas to verify council path)");
  } else {
    record("persisted execution_mode is fast — Telegram would send fast (no regression)", true);
    console.log("(council live test skipped — current persisted mode is fast; set council on canvas to verify council path)");
  }

  console.log("\n=== Simulated council round-trip (parse only, no DB write) ===");
  const councilSim = parseExecutionModeFromWorkspaceMeta({
    ...(typeof rawMeta === "object" && rawMeta ? rawMeta : {}),
    execution_mode: "council",
  });
  record("simulated council meta → council", councilSim === "council");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
