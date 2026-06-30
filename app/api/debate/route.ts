import { NextRequest, NextResponse } from "next/server";
import { DebateInvokeFailedError } from "@/lib/debate/debate-invoke-error";
import { isDebateTierMode } from "@/lib/debate/types";
import { runAgentDebate } from "@/lib/debate/run-agent-debate";
import { resolveCityHallMainAgent } from "@/lib/workspace/city-hall-orchestrator";
import { requireWorkspaceOfficeId } from "@/lib/workspace/resolve-workspace-office-id";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      taskText?: string;
      question?: string;
      sourceEntityId?: string;
      callerKind?: "mayor" | "chamber_manager";
      tierMode?: unknown;
      officeId?: string;
    };

    const question = (body.taskText || body.question || "").trim();
    if (!question) {
      return NextResponse.json({ error: "taskText обязателен" }, { status: 400 });
    }
    if (!isDebateTierMode(body.tierMode)) {
      return NextResponse.json({ error: "tierMode обязателен и должен быть валидным" }, { status: 400 });
    }

    const officeId = await requireWorkspaceOfficeId(body.officeId);
    const callerKind = body.callerKind === "chamber_manager" ? "chamber_manager" : "mayor";
    let callerEntityId = body.sourceEntityId?.trim();
    if (!callerEntityId) {
      const mayor = await resolveCityHallMainAgent(officeId);
      if (!mayor?.chamberRegistryId) {
        return NextResponse.json(
          { error: "Не найден Mayor chamber (routing_role=main) в City Hall" },
          { status: 503 },
        );
      }
      callerEntityId = mayor.chamberRegistryId;
    }

    const result = await runAgentDebate({
      question,
      callerEntityId,
      callerKind,
      tierMode: body.tierMode,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DebateInvokeFailedError) {
      return NextResponse.json({ error: err.userMessage }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
