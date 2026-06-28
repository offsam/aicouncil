import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/entity-registry";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ officeId: string; agentId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { agentId } = await params;
  const chamberRegistryId =
    request.nextUrl.searchParams.get("chamber_id") ??
    request.nextUrl.searchParams.get("chamberRegistryId") ??
    undefined;

  try {
    const context = await buildContext(agentId, { chamberRegistryId });
    return NextResponse.json(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
