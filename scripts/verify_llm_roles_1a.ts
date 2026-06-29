/**
 * LLM-ROLES-1A: system_llm_roles table + invokeCheapLLM runtime config.
 * Run: npx tsx scripts/verify_llm_roles_1a.ts
 */
import * as fs from "fs";
import pg from "pg";
import { invokeCheapLLM } from "../lib/cheap-llm";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import {
  defaultHardcodedRoleConfig,
  loadSystemLlmRoleConfig,
  resolveSystemLlmRole,
} from "../lib/system-llm-roles";
import { requireExternalEntryOfficeId } from "../lib/workspace/graph-identity-required";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function applyMigrationIfNeeded(client: pg.Client) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'system_llm_roles'`,
  );
  if (rows.length > 0) return;

  const sql = fs.readFileSync(
    "supabase/migrations/20260629120000_system_llm_roles.sql",
    "utf8",
  );
  await client.query(sql);
}

async function main() {
  console.log("=== Static purpose → role mapping ===\n");

  record("city-router → router", resolveSystemLlmRole("city-router") === "router");
  record("manager-routing → router", resolveSystemLlmRole("manager-routing") === "router");
  record("structure-command-gate → router", resolveSystemLlmRole("structure-command-gate") === "router");
  record("manager-summary → summary", resolveSystemLlmRole("manager-summary") === "summary");
  record("chamber-archive-summary → summary", resolveSystemLlmRole("chamber-archive-summary") === "summary");
  record("tech-structure-plan → planner", resolveSystemLlmRole("tech-structure-plan") === "planner");
  record(
    "tech-structure-plan-destructive → planner",
    resolveSystemLlmRole("tech-structure-plan-destructive") === "planner",
  );
  record("workflow-planner → planner", resolveSystemLlmRole("workflow-planner") === "planner");

  const defaults = defaultHardcodedRoleConfig();
  record("default hardcode anthropic primary", defaults.primaryProvider === "anthropic");
  record("default hardcode openai fallback", defaults.fallbackProvider === "openai");

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
  await applyMigrationIfNeeded(client);

  const officeId = await requireExternalEntryOfficeId();
  const sb = getSupabaseAdmin();

  console.log("\n=== Seeded rows for office ===\n");
  const { data: seeded } = await sb
    .from("system_llm_roles")
    .select("role, primary_provider, primary_model, fallback_provider, fallback_model")
    .eq("office_id", officeId)
    .order("role");

  record("3 roles seeded", (seeded ?? []).length === 3, seeded);
  for (const row of seeded ?? []) {
    record(
      `seed ${row.role} anthropic→openai`,
      row.primary_provider === "anthropic" && row.fallback_provider === "openai",
      row,
    );
  }

  console.log("\n=== Custom config drives provider (router) ===\n");

  const { error: upsertErr } = await sb.from("system_llm_roles").upsert(
    {
      office_id: officeId,
      role: "router",
      primary_provider: "gemini",
      primary_model: "gemini-2.5-flash",
      fallback_provider: "groq",
      fallback_model: "llama-3.3-70b-versatile",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "office_id,role" },
  );
  if (upsertErr) throw upsertErr;

  const customLoaded = await loadSystemLlmRoleConfig(officeId, "router");
  record("custom router config loaded", customLoaded?.primaryProvider === "gemini", customLoaded);

  const logs: string[] = [];
  const origInfo = console.info;
  console.info = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
    origInfo(...args);
  };

  try {
    await invokeCheapLLM({
      purpose: "city-router",
      prompt: 'Respond JSON only: {"selections":[{"id":"c0000000-0000-4000-8000-000000000000","confidence":1,"reason":"test"}]}',
      responseFormat: "json",
      maxTokens: 64,
      officeId,
    });
  } catch {
    /* provider may fail on minimal prompt — we only need log line */
  } finally {
    console.info = origInfo;
  }

  const roleLog = logs.find((l) => l.includes("purpose=city-router") && l.includes("role=router"));
  record("invokeCheapLLM logged role=router", Boolean(roleLog), roleLog);
  record(
    "custom config: primary provider=gemini in log",
    logs.some((l) => l.includes("purpose=city-router") && l.includes("provider=gemini")),
    logs.filter((l) => l.includes("city-router")),
  );

  console.log("\n=== Restore default router row ===\n");
  await sb.from("system_llm_roles").upsert(
    {
      office_id: officeId,
      role: "router",
      primary_provider: "anthropic",
      primary_model: "claude-haiku-4-5-20251001",
      fallback_provider: "openai",
      fallback_model: "gpt-4o-mini",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "office_id,role" },
  );

  console.log("\n=== Regression: missing row → hardcode ===\n");

  const fakeOfficeId = "00000000-0000-4000-8000-000000009999";
  const missing = await loadSystemLlmRoleConfig(fakeOfficeId, "planner");
  record("unknown office → null config", missing === null);
  record(
    "hardcode matches service defaults",
    defaults.primaryModel === "claude-haiku-4-5-20251001" &&
      defaults.fallbackModel === "gpt-4o-mini",
  );

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
