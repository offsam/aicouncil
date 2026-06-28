import { NextRequest, NextResponse } from "next/server";
import { executeChatTask } from "@/lib/execute-chat-task";
import { isExecutionMode, type ExecutionMode } from "@/lib/execution-mode";
import { toUserFacingProviderError } from "@/lib/provider-user-error";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Thin unified chat endpoint: task text in → routed agent answer out.
 * Wraps processTask + invokeAgentForWorkflow (no duplicate business logic).
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      taskText?: string;
      question?: string;
      sourceEntityId?: string;
      executionMode?: ExecutionMode;
      forceFailSlugs?: string[];
      targetAgentId?: string;
      directTargetEntityId?: string;
      turbo?: boolean;
      attachmentIds?: string[];
    };

    const taskText = (body.taskText || body.question || "").trim();
    if (!taskText) {
      return NextResponse.json({ error: "taskText обязателен" }, { status: 400 });
    }

    const sourceEntityId = body.sourceEntityId?.trim() || undefined;
    const executionMode: ExecutionMode | undefined = isExecutionMode(body.executionMode)
      ? body.executionMode
      : undefined;

    const result = await executeChatTask(taskText, sourceEntityId, executionMode, {
      forceFailSlugs:
        process.env.NODE_ENV !== "production" ? body.forceFailSlugs : undefined,
      targetAgentId: body.targetAgentId?.trim() || undefined,
      directTargetEntityId: body.directTargetEntityId?.trim() || undefined,
      turbo: !!body.turbo,
      attachmentIds: Array.isArray(body.attachmentIds)
        ? body.attachmentIds.filter((id): id is string => typeof id === "string" && id.length > 0)
        : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/chat]", err instanceof Error ? err.message : err);
    const message = toUserFacingProviderError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
