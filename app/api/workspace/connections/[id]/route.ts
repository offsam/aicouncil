import { NextRequest, NextResponse } from "next/server";
import {
  fetchWhitelistedInternalApi,
  forwardInternalApiResponse,
} from "@/lib/security/fetch-internal-api";
import { internalConnectionPath, isUuid } from "@/lib/security/internal-api-targets";

type RouteParams = { params: Promise<{ id: string }> };

/** BFF for X-03 connection PATCH — adds internal secret server-side. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "connection id must be a valid UUID" }, { status: 400 });
  }

  const body = await request.text();
  const upstream = await fetchWhitelistedInternalApi(request, internalConnectionPath(id), {
    method: "PATCH",
    headers: { "Content-Type": request.headers.get("Content-Type") ?? "application/json" },
    body,
  });
  return forwardInternalApiResponse(upstream);
}

/** BFF for X-03 connection DELETE — adds internal secret server-side. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "connection id must be a valid UUID" }, { status: 400 });
  }

  const upstream = await fetchWhitelistedInternalApi(request, internalConnectionPath(id), {
    method: "DELETE",
  });
  return forwardInternalApiResponse(upstream);
}
