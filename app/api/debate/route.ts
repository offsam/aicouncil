import { NextRequest, NextResponse } from "next/server";
import { isDebateTierMode } from "@/lib/debate/types";
import { runAgentDebate } from "@/lib/debate/run-agent-debate";
import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";
import { resolveCityHallMainAgent } from "@/lib/workspace/city-hall-orchestrator";
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
    };

    const question = (body.taskText || body.question || "").trim();
    if (!question) {
      return NextResponse.json({ error: "taskText обязателен" }, { status: 400 });
    }
    if (!isDebateTierMode(body.tierMode)) {
      return NextResponse.json({ error: "tierMode обязателен и должен быть валидным" }, { status: 400 });
    }

    const callerKind = body.callerKind === "chamber_manager" ? "chamber_manager" : "mayor";
    let callerEntityId = body.sourceEntityId?.trim();
    if (!callerEntityId) {
      const mayor = await resolveCityHallMainAgent(AI_COUNCIL_OFFICE_ID);
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
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
