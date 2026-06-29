/**
 * LLM-ROLES default providers: Anthropic Haiku primary, OpenAI GPT-4o-mini fallback.
 * Run: npx tsx scripts/verify_llm_roles_default_providers.ts
 */
import * as fs from "fs";
import pg from "pg";
import { invokeCheapLLM } from "../lib/cheap-llm";
import { ANTHROPIC_PRIMARY_MODEL } from "../lib/anthropic-models";
import { OPENAI_PRIMARY_MODEL } from "../lib/openai-models";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import {
  defaultHardcodedRoleConfig,
  loadSystemLlmRoleConfig,
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

async function applyDefaultMigration(client: pg.Client) {
  const sql = fs.readFileSync(
    "supabase/migrations/20260629140000_system_llm_roles_anthropic_openai_defaults.sql",
    "utf8",
  );
  await client.query(sql);
}

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
    origInfo(...args);
  };
  console.warn = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
    origWarn(...args);
  };
  try {
    await fn();
  } catch {
    /* may fail after logging */
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
  }
  return logs;
}

async function main() {
  console.log("=== Hardcode defaults ===\n");
  const hardcode = defaultHardcodedRoleConfig();
  record("hardcode anthropic primary", hardcode.primaryProvider === "anthropic", hardcode);
  record("hardcode haiku model", hardcode.primaryModel === ANTHROPIC_PRIMARY_MODEL);
  record("hardcode openai fallback", hardcode.fallbackProvider === "openai");
  record("hardcode gpt-4o-mini", hardcode.fallbackModel === OPENAI_PRIMARY_MODEL);

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
  await applyDefaultMigration(client);

  const officeId = await requireExternalEntryOfficeId();
  const sb = getSupabaseAdmin();

  console.log("\n=== DB defaults for office ===\n");
  const { data: rows } = await sb
    .from("system_llm_roles")
    .select("role, primary_provider, primary_model, fallback_provider, fallback_model")
    .eq("office_id", officeId)
    .order("role");

  record("3 roles in DB", (rows ?? []).length === 3);
  for (const row of rows ?? []) {
    record(
      `${row.role}: anthropic→openai`,
      row.primary_provider === "anthropic" &&
        row.primary_model === ANTHROPIC_PRIMARY_MODEL &&
        row.fallback_provider === "openai" &&
        row.fallback_model === OPENAI_PRIMARY_MODEL,
      row,
    );
  }

  const purposes = [
    { purpose: "city-router", role: "router" },
    { purpose: "tech-structure-plan", role: "planner" },
    { purpose: "manager-summary", role: "summary" },
  ] as const;

  console.log("\n=== Live default provider (all 3 roles) ===\n");

  for (const { purpose, role } of purposes) {
    const loaded = await loadSystemLlmRoleConfig(officeId, role);
    record(`${role} config loaded`, loaded?.primaryProvider === "anthropic", loaded);

    const logs = await captureLogs(async () => {
      await invokeCheapLLM({
        purpose,
        prompt:
          purpose === "manager-summary"
            ? "Summarize in one sentence: dept answered about widgets."
            : purpose === "tech-structure-plan"
              ? '{"summary":"test","actions":[]}'
              : '{"selections":[{"id":"c0000000-0000-4000-8000-000000000000","confidence":1,"reason":"test"}]}',
        responseFormat: purpose === "manager-summary" ? "text" : "json",
        maxTokens: 64,
        officeId,
      });
    });

    record(
      `${purpose}: primary log uses anthropic`,
      logs.some((l) => l.includes(`purpose=${purpose}`) && l.includes("provider=anthropic")),
      logs.filter((l) => l.includes(purpose)),
    );
    record(
      `${purpose}: not groq primary`,
      !logs.some((l) => l.includes(`purpose=${purpose}`) && l.includes("provider=groq")),
    );
  }

  console.log("\n=== Primary failure → OpenAI fallback ===\n");

  const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "invalid_key_for_fallback_test";

  const fallbackLogs = await captureLogs(async () => {
    await invokeCheapLLM({
      purpose: "city-router",
      prompt:
        'Return json only: {"selections":[{"id":"c0000000-0000-4000-8000-000000000000","confidence":1,"reason":"fallback test"}]}',
      responseFormat: "json",
      maxTokens: 64,
      officeId,
    });
  });
  process.env.ANTHROPIC_API_KEY = savedAnthropicKey;

  record(
    "anthropic primary failed (warn logged)",
    fallbackLogs.some((l) => l.includes("anthropic failed") || l.includes("anthropic primary")),
    fallbackLogs.filter((l) => l.includes("anthropic")),
  );
  record(
    "fallback openai used in success log",
    fallbackLogs.some(
      (l) => l.includes("purpose=city-router") && l.includes("provider=openai"),
    ),
    fallbackLogs.filter((l) => l.includes("city-router")),
  );

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
