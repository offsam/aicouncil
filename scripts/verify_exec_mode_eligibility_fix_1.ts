/**
 * EXEC-MODE-ELIGIBILITY-FIX-1 verification.
 * Run: npx tsx scripts/verify_exec_mode_eligibility_fix_1.ts [baseUrl]
 */
import * as fs from "fs";
import {
  executionModeEligibilityFromTierCounts,
} from "../lib/workspace/mayor-execution-eligibility";
import { resolveCityWideTierCountsExcludingCityHall } from "../lib/workspace/city-wide-tier-counts";
import { requireCityHallBuildingId } from "../lib/workspace/graph-identity-required";
import { requireExternalEntryOfficeId } from "../lib/workspace/graph-identity-required";
import { getSupabaseAdmin } from "../lib/supabase/admin";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = process.argv[2] ?? "http://localhost:3000";

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function main() {
  const officeId = await requireExternalEntryOfficeId();
  const cityHallId = await requireCityHallBuildingId(officeId);
  console.log("City Hall building id (graph resolver):", cityHallId);

  const cityWide = await resolveCityWideTierCountsExcludingCityHall(officeId);
  record("cityWideTierCounts returned", Boolean(cityWide.tierCounts));
  record("excludedCityHallBuildingId matches resolver", cityWide.excludedCityHallBuildingId === cityHallId);
  console.log("cityWideTierCounts:", cityWide.tierCounts);

  const eligibility = executionModeEligibilityFromTierCounts(cityWide.tierCounts);
  console.log("eligibility:", eligibility);

  const supabase = getSupabaseAdmin();
  const { data: cityHallChambers } = await supabase
    .from("chambers")
    .select("id")
    .or(`building_entity_id.eq.${cityHallId},building_object_id.eq.${cityHallId}`);
  const cityHallChamberIds = new Set((cityHallChambers ?? []).map((c) => c.id));

  const { data: cityHallMid } = await supabase
    .from("agent_assignments")
    .select("agents!inner(cost_tier)")
    .in("chamber_id", [...cityHallChamberIds]);

  const cityHallMidCount = (cityHallMid ?? []).filter(
    (r) => (r.agents as { cost_tier?: string }).cost_tier === "mid",
  ).length;
  console.log("City Hall mid agents (isolated, not in cityWide):", cityHallMidCount);

  if (cityHallMidCount > 0 && cityWide.tierCounts.mid === 0) {
    record("Council ignores City Hall-only mid agents", !eligibility.councilEligible);
  } else {
    record("Council ignores City Hall-only mid agents (skip — no mid in City Hall to prove)", true);
  }

  const res = await fetch(`${BASE}/api/workspace/city-hall-orchestrator`);
  const body = (await res.json()) as Record<string, unknown>;
  record("live endpoint 200", res.ok, { status: res.status });
  console.log("\nLive /api/workspace/city-hall-orchestrator:");
  console.log(JSON.stringify(body, null, 2));

  record("live cityWideTierCounts present", body.cityWideTierCounts != null);
  record("live excludedCityHallBuildingId present", typeof body.excludedCityHallBuildingId === "string");
  record("live teamEligible boolean", typeof body.teamEligible === "boolean");
  record("live councilEligible boolean", typeof body.councilEligible === "boolean");
  record("live turboEligible boolean", typeof body.turboEligible === "boolean");
  record("no mainChamberTierCounts in response", body.mainChamberTierCounts === undefined);

  if (process.exitCode === 1) {
    console.error("\nSome checks failed.");
  } else {
    console.log("\nAll verify_exec_mode_eligibility_fix_1 checks passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
