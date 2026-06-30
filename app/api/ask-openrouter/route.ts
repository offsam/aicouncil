import { NextRequest, NextResponse } from "next/server";
import { AskResponseBody } from "@/lib/api-types";
import { invokeAgentFromAskRoute } from "@/lib/invoke-agent-from-ask-route";
import { toUserFacingChatError, chatErrorHttpStatus } from "@/lib/provider-user-error";

interface OpenRouterAskBody {
  question?: string;
  model?: string;
  chamberRegistryId?: string;
  chamberId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OpenRouterAskBody;
    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json<AskResponseBody>(
        { error: "Введите текстовый вопрос для OpenRouter." },
        { status: 400 },
      );
    }

    const { answer } = await invokeAgentFromAskRoute(request.nextUrl.pathname, body);
    return NextResponse.json<AskResponseBody>({ answer });
  } catch (err) {
    console.error("[api/ask-openrouter]", err instanceof Error ? err.message : err);
    return NextResponse.json<AskResponseBody>(
      { error: toUserFacingChatError(err) },
      { status: chatErrorHttpStatus(err) },
    );
  }
}
