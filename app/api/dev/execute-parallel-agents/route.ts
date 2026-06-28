import { NextRequest, NextResponse } from "next/server";
import { executeParallelAgents } from "@/lib/execute-parallel-agents";

interface Body {
  targetChamberRegistryId?: string;
  question?: string;
  agentCount?: number;
  batchId?: string;
}

/**
 * Dev-only endpoint for W10B step 2 parallel orchestration tests.
 * Not wired to chat UI — direct API proof only.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as Body;
    const targetChamberRegistryId = body.targetChamberRegistryId?.trim();
    const question = body.question?.trim();
    const agentCount = body.agentCount ?? 3;

    if (!targetChamberRegistryId) {
      return NextResponse.json({ error: "targetChamberRegistryId обязателен" }, { status: 400 });
    }
    if (!question) {
      return NextResponse.json({ error: "question обязателен" }, { status: 400 });
    }
    if (agentCount < 1 || agentCount > 11) {
      return NextResponse.json({ error: "agentCount must be 1–11" }, { status: 400 });
    }

    const result = await executeParallelAgents({
      targetChamberRegistryId,
      question,
      agentCount,
      batchId: body.batchId,
      logToRequestLogs: true,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
