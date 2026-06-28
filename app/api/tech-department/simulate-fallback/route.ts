import { NextRequest, NextResponse } from "next/server";
import { recordProviderSuccess } from "@/lib/provider-failover-status";
import { computeTechDepartmentStats } from "@/lib/tech-department-stats";

/**
 * Dev/evidence hook: record one provider fallback switch without calling LLM.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    providerTag?: string;
    primaryModel?: string;
    modelUsed?: string;
  };

  const providerTag = body.providerTag?.trim() || "gemini";
  const primaryModel = body.primaryModel?.trim() || "gemini-2.5-flash";
  const modelUsed = body.modelUsed?.trim() || "gemini-2.5-flash-lite";

  recordProviderSuccess(providerTag, primaryModel, modelUsed);
  const stats = await computeTechDepartmentStats();

  return NextResponse.json({ ok: true, stats });
}
