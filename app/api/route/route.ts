import { NextRequest, NextResponse } from "next/server";
import { resolveRoute } from "@/lib/routing";
import { resolveAgentIdsForTarget, GENERAL_INTAKE_ID } from "@/lib/route-agent-ids";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { requireExternalEntryOfficeId } from "@/lib/workspace/graph-identity-required";

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
    }

    const body = await request.json() as {
      question?: string;
      fileExtension?: string;
      sourceEntityId?: string;
    };
    const question = body.question?.trim() || "";
    const fileExtension = body.fileExtension?.trim();
    const sourceEntityId = body.sourceEntityId?.trim() || undefined;
    const officeId = await requireExternalEntryOfficeId();

    const decision = await resolveRoute(question, fileExtension, sourceEntityId, officeId);
    const chosenTargetId = decision.targets[0]?.entityRegistryId || GENERAL_INTAKE_ID;
    const selectedAgentIds = await resolveAgentIdsForTarget(chosenTargetId);

    return NextResponse.json({
      decision,
      agentIds: selectedAgentIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
