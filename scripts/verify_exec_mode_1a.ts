/**
 * EXEC-MODE-1A closure checks: Turbo as fourth ExecutionMode + unified tier policy.
 * Run: npx tsx scripts/verify_exec_mode_1a.ts
 */
import * as fs from "fs";
import {
  EXECUTION_MODE_ALLOWED_TIERS,
  getAllowedTiersForExecutionMode,
  getRequiredTierForExecutionMode,
  isCostTierAllowedForExecutionMode,
  resolveExecutionModeWithLegacyTurbo,
} from "../lib/execution-mode-tier-policy";
import { EXECUTION_MODES, isExecutionMode, type ExecutionMode } from "../lib/execution-mode";
import {
  isAgentTierHighlightedForWorkspace,
  isCostTierActiveForExecutionMode,
} from "../lib/workspace/execution-mode-tiers";
import { selectAgentsForExecutionMode } from "../lib/agent-selection";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import type { CostTier } from "../lib/cost-tier";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

/** Mixed-tier roster fixture (routing diagnostic). */
const MIXED_ROSTER_CHAMBER = "0ca3b7af-1607-4432-baf6-382a3bf0c0f8";
/** Free-only roster fixture (manager chamber — main chamber has no roster). */
const FREE_ONLY_CHAMBER = "2e9694d9-244e-487b-9579-a77eae571d1f";

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function findChamberWithPremium(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data: chambers } = await supabase
    .from("chambers")
    .select("entity_registry_id")
    .not("entity_registry_id", "is", null)
    .limit(200);
  for (const chamber of chambers ?? []) {
    const id = chamber.entity_registry_id;
    if (!id) continue;
    try {
      const agents = await selectAgentsForExecutionMode(id, "turbo");
      if (agents.some((a) => a.costTier === "premium")) return id;
    } catch {
      /* try next */
    }
  }
  return null;
}

function verifyTypeAndPolicy() {
  record(
    'ExecutionMode includes "turbo"',
    EXECUTION_MODES.includes("turbo") && isExecutionMode("turbo"),
  );

  record(
    "turbo allowed tiers = all four",
    EXECUTION_MODE_ALLOWED_TIERS.turbo.join() === "free,cheap,mid,premium",
  );

  record(
    "turbo required tier is null (no premium mandate)",
    getRequiredTierForExecutionMode("turbo") === null,
  );

  const tiers: CostTier[] = ["free", "cheap", "mid", "premium"];
  for (const tier of tiers) {
    const allowed = isCostTierAllowedForExecutionMode(tier, "turbo");
    record(`turbo allows ${tier}`, allowed);
    record(
      `canvas highlight matches backend for turbo/${tier}`,
      isAgentTierHighlightedForWorkspace(tier, "turbo") === allowed &&
        isCostTierActiveForExecutionMode(tier, "turbo") === allowed &&
        getAllowedTiersForExecutionMode("turbo").includes(tier) === allowed,
    );
  }
}

function verifyLegacyMapping() {
  record(
    "legacy { turbo: true } → executionMode turbo",
    resolveExecutionModeWithLegacyTurbo("fast", true) === "turbo",
  );
  record(
    "legacy turbo overrides council",
    resolveExecutionModeWithLegacyTurbo("council", true) === "turbo",
  );
  record(
    "no legacy turbo keeps mode",
    resolveExecutionModeWithLegacyTurbo("team", false) === "team",
  );
}

async function verifyTurboSelection() {
  const premiumChamber = (await findChamberWithPremium()) ?? MIXED_ROSTER_CHAMBER;
  try {
    const withPremium = await selectAgentsForExecutionMode(premiumChamber, "turbo");
    const tierSet = new Set(withPremium.map((a) => a.costTier));
    record(
      "turbo on mixed roster returns multiple tiers incl. premium when present",
      withPremium.length >= 1 && tierSet.size >= 2,
      {
        chamber: premiumChamber,
        count: withPremium.length,
        tiers: [...tierSet],
      },
    );
  } catch (err) {
    record("turbo on mixed roster", false, err instanceof Error ? err.message : err);
  }

  try {
    const freeOnly = await selectAgentsForExecutionMode(FREE_ONLY_CHAMBER, "turbo");
    record(
      "turbo on free-only roster does not require premium",
      freeOnly.length >= 1 && freeOnly.every((a) => a.costTier === "free"),
      {
        chamber: FREE_ONLY_CHAMBER,
        count: freeOnly.length,
        tiers: freeOnly.map((a) => a.costTier),
      },
    );
  } catch (err) {
    record(
      "turbo on free-only roster does not throw",
      false,
      err instanceof Error ? err.message : err,
    );
  }
}

function verifyMayorPathUntouched() {
  const src = fs.readFileSync("lib/execute-chat-task.ts", "utf8");
  const mayorStart = src.indexOf("async function executeMayorTask");
  const mayorBlock = mayorStart >= 0 ? src.slice(mayorStart, mayorStart + 12000) : "";
  record(
    "executeMayorTask still has answer_self routing",
    mayorBlock.includes('action: "answer_self"'),
  );
  record(
    "executeMayorTask does not call selectAgentsForExecutionMode",
    !mayorBlock.includes("selectAgentsForExecutionMode"),
  );
}

async function main() {
  verifyTypeAndPolicy();
  verifyLegacyMapping();
  await verifyTurboSelection();
  verifyMayorPathUntouched();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
