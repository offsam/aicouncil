import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const INTERNAL_SECRET_HEADER = "X-Internal-Secret";

const UNAUTHORIZED_BODY = { error: "Unauthorized" } as const;

function hashSecret(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function secretsMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(hashSecret(provided), hashSecret(expected));
}

function unauthorized(): NextResponse {
  return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
}

/**
 * Gate for internal-only HTTP handlers (shared secret, not user auth).
 * Returns a 401 response when access is denied; returns null when the request may proceed.
 *
 * Production: missing INTERNAL_API_SECRET → fail closed (401).
 * Development: missing INTERNAL_API_SECRET → bypass (null).
 */
export function requireInternalSecret(request: NextRequest): NextResponse | null {
  const configured = process.env.INTERNAL_API_SECRET?.trim() ?? "";
  const isProduction = process.env.NODE_ENV === "production";

  if (!configured) {
    return isProduction ? unauthorized() : null;
  }

  const provided = request.headers.get(INTERNAL_SECRET_HEADER)?.trim() ?? "";
  if (!provided || !secretsMatch(provided, configured)) {
    return unauthorized();
  }

  return null;
}
