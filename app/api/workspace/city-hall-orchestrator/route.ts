import { NextResponse } from "next/server";
import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveCityHallMainAgent } from "@/lib/workspace/city-hall-orchestrator";
import {
  debateTierCountsFromChambers,
  isDebateTierConfigured,
  resolveCityHallDebateChambersByTier,
} from "@/lib/workspace/resolve-city-hall-council-chamber";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const [orchestrator, debateResolution] = await Promise.all([
      resolveCityHallMainAgent(AI_COUNCIL_OFFICE_ID),
      resolveCityHallDebateChambersByTier(AI_COUNCIL_OFFICE_ID),
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
