/**
 * Verify tier-isolated debate: four chambers + pair selection + full cycle.
 */
import * as fs from "fs";
import type { CostTier } from "../lib/cost-tier";
import { COST_TIER_LABEL_RU } from "../lib/cost-tier";
import { debateTierMode } from "../lib/debate/types";
import { runAgentDebate } from "../lib/debate/run-agent-debate";
import { selectDebatePair } from "../lib/debate/select-debate-pair";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import { resolveCityHallDebateChambersByTier } from "../lib/workspace/resolve-city-hall-council-chamber";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const CALLER = "8eff3441-a548-4d75-bf10-621bbd1f6d20"; // t_ test manager chamber
const ALL_TIERS: CostTier[] = ["free", "cheap", "mid", "premium"];

async function agentsAssignedToChamber(chamberId: string, agentIds: string[]): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agent_assignments")
    .select("agent_id")
    .eq("chamber_id", chamberId);
  const assigned = new Set((data ?? []).map((row) => row.agent_id));
  return agentIds.every((id) => assigned.has(id));
}

async function main() {
  const byTier = await resolveCityHallDebateChambersByTier();

  console.log("\n=== Tier chamber resolution ===");
  let pairPass = true;
  for (const tier of ALL_TIERS) {
    const chamber = byTier[tier];
    if (!chamber) {
      console.log(`FAIL ${tier}: debate chamber not found`);
      pairPass = false;
      continue;
    }
    console.log(
      `${tier} (${COST_TIER_LABEL_RU[tier]}): chamber «${chamber.name}» registry=${chamber.chamberRegistryId} agents=${chamber.agentCount}`,
    );

    if (chamber.agentCount < 2) {
      console.log(`  SKIP pair: need ≥2 agents, have ${chamber.agentCount}`);
      pairPass = false;
      continue;
    }

    const pair = await selectDebatePair(chamber.chamberRegistryId, tier);
    const tierOk =
      pair.author.costTier === tier &&
      pair.reviewer.costTier === tier &&
      pair.author.agentId !== pair.reviewer.agentId;
    const chamberOk = await agentsAssignedToChamber(chamber.chamberId, [
      pair.author.agentId,
      pair.reviewer.agentId,
    ]);
    console.log(
      `  pair: ${pair.author.slug} ↔ ${pair.reviewer.slug} | tierOK=${tierOk} chamberOK=${chamberOk}`,
    );
    if (!tierOk || !chamberOk) pairPass = false;
  }

  console.log("\n=== Full debate cycle (free tier, deterministic exhaust) ===");
  const exhaust = await runAgentDebate({
    question: "t_debate_deterministic_exhaust",
    callerEntityId: CALLER,
    callerKind: "chamber_manager",
    tierMode: debateTierMode("free"),
    deterministicAlwaysRevise: true,
  });
  console.log(
    "exhaust:",
    exhaust.closedReason,
    "chamber=",
    exhaust.councilChamberName,
    "debateTier=",
    exhaust.debateTier,
    "rounds=",
    exhaust.rounds.length,
  );
  const gotExhausted = exhaust.closedReason === "attempts_exhausted";
  const exhaustTierOk = exhaust.debateTier === "free";

  console.log("\n=== Full debate cycle (cheap tier, live confirm) ===");
  let gotConfirmed = false;
  let confirmTierOk = false;
  if ((byTier.cheap?.agentCount ?? 0) >= 2) {
    const confirm = await runAgentDebate({
      question: "t_debate_verify: ответь одним словом OK",
      callerEntityId: CALLER,
      callerKind: "chamber_manager",
      tierMode: debateTierMode("cheap"),
    });
    console.log(
      "confirm:",
      confirm.closedReason,
      "chamber=",
      confirm.councilChamberName,
      "debateTier=",
      confirm.debateTier,
      `${confirm.author.name} ↔ ${confirm.reviewer.name}`,
    );
    gotConfirmed = confirm.closedReason === "confirmed";
    confirmTierOk = confirm.debateTier === "cheap";
  } else {
    console.log("SKIP live confirm: cheap chamber has <2 agents");
  }

  console.log("\n=== Summary ===");
  console.log("tier pair selection:", pairPass ? "PASS" : "FAIL");
  console.log("attempts_exhausted (free):", gotExhausted && exhaustTierOk ? "PASS" : "FAIL");
  console.log(
    "confirmed (cheap live):",
    gotConfirmed && confirmTierOk ? "PASS" : gotConfirmed ? "PARTIAL" : "SKIP/FAIL",
  );

  if (!pairPass || !gotExhausted || !exhaustTierOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
