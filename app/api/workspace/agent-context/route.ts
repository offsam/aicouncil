import { NextRequest, NextResponse } from "next/server";
import {
  fetchWhitelistedInternalApi,
  forwardInternalApiResponse,
} from "@/lib/security/fetch-internal-api";
import {
  internalAgentContextPath,
  isUuid,
} from "@/lib/security/internal-api-targets";

/** BFF for X-02 agent context GET — adds internal secret server-side. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const officeId = searchParams.get("officeId")?.trim() ?? "";
  const agentId = searchParams.get("agentId")?.trim() ?? "";
  const chamberRegistryId =
    searchParams.get("chamberRegistryId")?.trim() ??
    searchParams.get("chamber_id")?.trim() ??
    undefined;

  if (!isUuid(officeId) || !isUuid(agentId)) {
    return NextResponse.json({ error: "officeId and agentId must be valid UUIDs" }, { status: 400 });
  }
  if (chamberRegistryId && !isUuid(chamberRegistryId)) {
    return NextResponse.json({ error: "chamberRegistryId must be a valid UUID" }, { status: 400 });
  }

  const internalPath = internalAgentContextPath(officeId, agentId, chamberRegistryId);
  const upstream = await fetchWhitelistedInternalApi(request, internalPath, { method: "GET" });
  return forwardInternalApiResponse(upstream);
}
