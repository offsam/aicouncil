import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveCityHallMainAgent } from "@/lib/workspace/city-hall-orchestrator";
import {
  debateTierCountsFromChambers,
  isDebateTierConfigured,
  resolveCityHallDebateChambersByTier,
} from "@/lib/workspace/resolve-city-hall-council-chamber";
import { requireWorkspaceOfficeId } from "@/lib/workspace/resolve-workspace-office-id";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const officeIdParam = new URL(request.url).searchParams.get("officeId");
    const officeId = await requireWorkspaceOfficeId(officeIdParam);
    const [orchestrator, debateResolution] = await Promise.all([
      resolveCityHallMainAgent(officeId),
      resolveCityHallDebateChambersByTier(officeId),
    ]);
    const { byTier, legacyCouncil } = debateResolution;
    const tierCounts = debateTierCountsFromChambers(byTier);
    const debateConfigured = isDebateTierConfigured(byTier);

    if (!orchestrator) {
      return NextResponse.json({
        configured: false,
        debateConfigured,
        tierCounts,
        debateChambersByTier: byTier,
        legacyCouncil,
      });
    }
    return NextResponse.json({
      configured: true,
      ...orchestrator,
      debateConfigured,
      tierCounts,
      debateChambersByTier: byTier,
      legacyCouncil,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
