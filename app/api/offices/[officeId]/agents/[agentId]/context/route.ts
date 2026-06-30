import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/entity-registry";
import {
  assertAgentContextAccess,
  CONTEXT_ACCESS_DENIED_PUBLIC_MESSAGE,
  isContextAccessDeniedError,
} from "@/lib/security/agent-context-access";
import { requireInternalSecret } from "@/lib/security/require-internal-secret";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ officeId: string; agentId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const secretDenied = requireInternalSecret(request);
  if (secretDenied) return secretDenied;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId, agentId } = await params;
  const chamberRegistryId =
    request.nextUrl.searchParams.get("chamber_id") ??
    request.nextUrl.searchParams.get("chamberRegistryId") ??
    undefined;

  try {
    await assertAgentContextAccess({ officeId, agentId, chamberRegistryId });
    const context = await buildContext(agentId, { chamberRegistryId });
    return NextResponse.json(context);
  } catch (err) {
    if (isContextAccessDeniedError(err)) {
      return NextResponse.json({ error: CONTEXT_ACCESS_DENIED_PUBLIC_MESSAGE }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
