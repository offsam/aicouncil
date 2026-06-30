import { NextRequest, NextResponse } from "next/server";
import { AskRequestBody, AskResponseBody, validateAskInput } from "@/lib/api-types";
import { invokeAgentFromAskRoute } from "@/lib/invoke-agent-from-ask-route";
import { toUserFacingChatError, chatErrorHttpStatus } from "@/lib/provider-user-error";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AskRequestBody;
    const validationError = validateAskInput(body);
    if (validationError) {
      return NextResponse.json<AskResponseBody>({ error: validationError }, { status: 400 });
    }

    const { answer } = await invokeAgentFromAskRoute(request.nextUrl.pathname, body);
    return NextResponse.json<AskResponseBody>({ answer });
  } catch (err) {
    console.error("[api/ask-mistral]", err instanceof Error ? err.message : err);
    return NextResponse.json<AskResponseBody>(
      { error: toUserFacingChatError(err) },
      { status: chatErrorHttpStatus(err) },
    );
  }
}
