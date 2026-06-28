/**
 * Verify execution mode tier gating (global activator semantics).
 * Run: npx tsx scripts/verify_execution_mode_tiers.ts
 */
import * as fs from "fs";
import {
  EXECUTION_MODE_MAX_ACTIVE_TIER,
  isCostTierActiveForExecutionMode,
  parseExecutionModeFromWorkspaceMeta,
} from "../lib/workspace/execution-mode-tiers";
import { selectAgentsForExecutionMode } from "../lib/agent-selection";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import type { CostTier } from "../lib/cost-tier";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

/** t_ТолькоФри_Башня main — free-only roster (routing diagnostic fixture). */
const FREE_ONLY_MAIN_CHAMBER = "fd5538ad-df4f-494f-af96-e6528132f5e7";

async function findChamberForMode(mode: "fast" | "team"): Promise<string | null> {
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
      const agents = await selectAgentsForExecutionMode(id, mode);
      if (agents.length > 0) return id;
    } catch {
      /* try next */
    }
  }
  return null;
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function main() {
  record(
    "parse workspace_meta default → fast",
    parseExecutionModeFromWorkspaceMeta({}) === "fast",
  );
  record(
    "parse workspace_meta team",
    parseExecutionModeFromWorkspaceMeta({ execution_mode: "team" }) === "team",
  );

  const tiers: CostTier[] = ["free", "cheap", "mid", "premium"];
  for (const tier of tiers) {
    record(
      `fast mode: ${tier} eligible=${isCostTierActiveForExecutionMode(tier, "fast")}`,
      isCostTierActiveForExecutionMode(tier, "fast") === (tier === "free"),
    );
    record(
      `team mode: ${tier} eligible=${isCostTierActiveForExecutionMode(tier, "team")}`,
      isCostTierActiveForExecutionMode(tier, "team") === (tier === "free" || tier === "cheap"),
    );
    record(
      `council mode: ${tier} eligible=${isCostTierActiveForExecutionMode(tier, "council")}`,
      isCostTierActiveForExecutionMode(tier, "council") === tier !== "premium",
    );
  }

  record(
    "max active tier map",
    EXECUTION_MODE_MAX_ACTIVE_TIER.fast === "free" &&
      EXECUTION_MODE_MAX_ACTIVE_TIER.team === "cheap" &&
      EXECUTION_MODE_MAX_ACTIVE_TIER.council === "mid",
  );

  const freeChamber = (await findChamberForMode("fast")) ?? FREE_ONLY_MAIN_CHAMBER;
  if (!freeChamber) {
    record("fast selects free-only roster subset", false, "no chamber with free agents");
  } else {
    const fastAgents = await selectAgentsForExecutionMode(freeChamber, "fast");
    record(
      "fast selects free-only roster subset",
      fastAgents.length >= 1 && fastAgents.every((a) => a.costTier === "free"),
      { chamber: freeChamber, count: fastAgents.length, tiers: fastAgents.map((a) => a.costTier) },
    );
  }

  const teamChamber = await findChamberForMode("team");
  if (teamChamber) {
    const teamAgents = await selectAgentsForExecutionMode(teamChamber, "team");
    const fastMixed = await selectAgentsForExecutionMode(teamChamber, "fast");
    record(
      "team selects wider roster than fast (when cheap exists)",
      teamAgents.length >= fastMixed.length,
      {
        chamber: teamChamber,
        fast: fastMixed.length,
        team: teamAgents.length,
        teamTiers: teamAgents.map((a) => a.costTier),
      },
    );
  } else {
    record("team wider roster (no team-eligible chamber in DB)", true, "skipped");
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
