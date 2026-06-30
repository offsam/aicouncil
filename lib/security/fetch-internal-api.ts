import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { INTERNAL_SECRET_HEADER } from "./require-internal-secret";

/**
 * Server-only fetch to a whitelisted internal route (caller supplies path from internal-api-targets).
 * Adds X-Internal-Secret when configured; never logs the secret value.
 */
export async function fetchWhitelistedInternalApi(
  request: NextRequest,
  internalPath: string,
  init?: RequestInit,
): Promise<Response> {
  const configured = process.env.INTERNAL_API_SECRET?.trim() ?? "";
  const headers = new Headers(init?.headers);
  if (configured) {
    headers.set(INTERNAL_SECRET_HEADER, configured);
  }

  const url = new URL(internalPath, request.nextUrl.origin);
  return fetch(url, { ...init, headers, cache: "no-store" });
}

/** Forward upstream JSON/text without leaking internal headers. */
export async function forwardInternalApiResponse(upstream: Response): Promise<NextResponse> {
  const body = await upstream.text();
  const contentType = upstream.headers.get("Content-Type") ?? "application/json";
  return new NextResponse(body, { status: upstream.status, headers: { "Content-Type": contentType } });
}
