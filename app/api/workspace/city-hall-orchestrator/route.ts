import { NextResponse } from "next/server";
import { resolveChamberRosterTierCounts } from "@/lib/agent-selection";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveCityHallMainAgent } from "@/lib/workspace/city-hall-orchestrator";
import {
  debateTierCountsFromChambers,
  isDebateTierConfigured,
  resolveCityHallDebateChambersByTier,
} from "@/lib/workspace/resolve-city-hall-council-chamber";
import { mayorExecutionEligibility } from "@/lib/workspace/mayor-execution-eligibility";
import { requireWorkspaceOfficeId } from "@/lib/workspace/resolve-workspace-office-id";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const officeIdParam = new URL(request.url).searchParams.get("officeId");
    const officeId = await requireWorkspaceOfficeId(officeIdParam);
    const [orchestrator, byTier] = await Promise.all([
      resolveCityHallMainAgent(officeId),
      resolveCityHallDebateChambersByTier(officeId),
    ]);
    const tierCounts = debateTierCountsFromChambers(byTier);
    const debateConfigured = isDebateTierConfigured(byTier);
    const mainChamberTierCounts = orchestrator
      ? await resolveChamberRosterTierCounts(orchestrator.chamberRegistryId)
      : null;
    const eligibility = mayorExecutionEligibility(tierCounts, mainChamberTierCounts);

    if (!orchestrator) {
      return NextResponse.json({
        configured: false,
        debateConfigured,
        tierCounts,
        mainChamberTierCounts,
        teamEligible: eligibility.teamEligible,
        councilEligible: eligibility.councilEligible,
        debateChambersByTier: byTier,
      });
    }
    return NextResponse.json({
      configured: true,
      ...orchestrator,
      debateConfigured,
      tierCounts,
      mainChamberTierCounts,
      teamEligible: eligibility.teamEligible,
      councilEligible: eligibility.councilEligible,
      debateChambersByTier: byTier,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
