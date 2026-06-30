import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveCityHallMainAgent } from "@/lib/workspace/city-hall-orchestrator";
import { resolveCityWideTierCountsExcludingCityHall } from "@/lib/workspace/city-wide-tier-counts";
import {
  debateTierCountsFromChambers,
  isDebateTierConfigured,
  resolveCityHallDebateChambersByTier,
} from "@/lib/workspace/resolve-city-hall-council-chamber";
import { executionModeEligibilityFromTierCounts } from "@/lib/workspace/mayor-execution-eligibility";
import { requireWorkspaceOfficeId } from "@/lib/workspace/resolve-workspace-office-id";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const officeIdParam = new URL(request.url).searchParams.get("officeId");
    const officeId = await requireWorkspaceOfficeId(officeIdParam);
    const [orchestrator, byTier, cityWide] = await Promise.all([
      resolveCityHallMainAgent(officeId),
      resolveCityHallDebateChambersByTier(officeId),
      resolveCityWideTierCountsExcludingCityHall(officeId),
    ]);
    const debateTierCounts = debateTierCountsFromChambers(byTier);
    const debateConfigured = isDebateTierConfigured(byTier);
    const eligibility = executionModeEligibilityFromTierCounts(cityWide.tierCounts);

    const executionModePayload = {
      cityWideTierCounts: cityWide.tierCounts,
      excludedCityHallBuildingId: cityWide.excludedCityHallBuildingId,
      teamEligible: eligibility.teamEligible,
      councilEligible: eligibility.councilEligible,
      turboEligible: eligibility.turboEligible,
    };

    if (!orchestrator) {
      return NextResponse.json({
        configured: false,
        debateConfigured,
        debateTierCounts,
        debateChambersByTier: byTier,
        ...executionModePayload,
      });
    }
    return NextResponse.json({
      configured: true,
      ...orchestrator,
      debateConfigured,
      debateTierCounts,
      debateChambersByTier: byTier,
      ...executionModePayload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
