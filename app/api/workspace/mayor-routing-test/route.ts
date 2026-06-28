import { NextRequest, NextResponse } from "next/server";
import { executeChatTask } from "@/lib/execute-chat-task";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveCityHallMainAgent } from "@/lib/workspace/city-hall-orchestrator";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      taskText?: string;
      sourceEntityId?: string;
    };

    const taskText = (body.taskText || "").trim();
    if (!taskText) {
      return NextResponse.json({ error: "taskText обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1. Resolve first office to get the Mayor agent ID
    const { data: offices, error: officeError } = await supabase
      .from("offices")
      .select("id")
      .limit(1);

    if (officeError || !offices || offices.length === 0) {
      return NextResponse.json(
        { error: `Failed to find any office in DB: ${officeError?.message || "empty list"}` },
        { status: 500 }
      );
    }

    const officeId = offices[0].id;
    const mayorInfo = await resolveCityHallMainAgent(officeId);
    if (!mayorInfo) {
      return NextResponse.json(
        { error: `Failed to resolve City Hall Mayor main agent for office ID ${officeId}` },
        { status: 500 }
      );
    }

    // 2. Call executeChatTask with the resolved Mayor targetAgentId
    const result = await executeChatTask(taskText, body.sourceEntityId, "fast", {
      targetAgentId: mayorInfo.agentId,
    });

    if (result.mode === "workflow") {
      return NextResponse.json({
        Input: taskText,
        Error: "Returned a workflow result instead of single route execution",
        FullResult: result
      });
    }

    // 3. Fetch the routing log details if routingLogId is present
    let routingLogDetails = null;
    const routing = result.routing;
    if (routing?.routingLogId) {
      const { data: logEntry } = await supabase
        .from("routing_logs")
        .select("*")
        .eq("id", routing.routingLogId)
        .maybeSingle();
      routingLogDetails = logEntry;
    }

    // 4. Return full diagnostic trace
    return NextResponse.json({
      Input: taskText,
      MayorAgentId: mayorInfo.agentId,
      MayorChamberRegistryId: mayorInfo.chamberRegistryId,
      RoutingDecision: {
        action: routingLogDetails?.routing_action || routing?.targets?.[0]?.reason || "unknown",
        matchedBy: routingLogDetails?.routing_matched_by || "unknown",
        confidence: routingLogDetails?.routing_confidence ?? 1.0,
        reasoning: routingLogDetails?.routing_reasoning || "",
        trace: routingLogDetails?.routing_trace || [],
      },
      Building: routingLogDetails?.delegated_building_id || null,
      MainChamber: routingLogDetails?.delegated_chamber_id || null,
      Execution: {
        agentId: routingLogDetails?.delegated_agent_id || result.agentId,
        agentName: result.agentName,
        answer: routingLogDetails?.delegated_answer || null,
        governmentFallback: result.governmentFallback ?? false,
      },
      Returned: result.answer,
      SummaryApplied: routingLogDetails?.summary_applied ?? false,
      FullResult: result,
      FullRoutingLog: routingLogDetails,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
