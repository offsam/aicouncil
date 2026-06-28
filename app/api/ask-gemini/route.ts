import { NextRequest, NextResponse } from "next/server";
import {
  AskRequestBody,
  AskResponseBody,
  validateAskInput,
} from "@/lib/api-types";
import {
  callGeminiWithFallback,
  GEMINI_PRIMARY_MODEL,
  type GeminiPart,
} from "@/lib/gemini-models";
import { getAgentContextPrompt } from "@/lib/entity-registry";

function buildParts(body: AskRequestBody): GeminiPart[] {
  const parts: GeminiPart[] = [];
  const question = body.question?.trim();

  if (body.imageBase64) {
    parts.push({
      inline_data: {
        mime_type: body.imageMediaType || "image/jpeg",
        data: body.imageBase64,
      },
    });
  }

  parts.push({
    text: question || "Опиши изображение и ответь на возможные вопросы по нему.",
  });

  return parts;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AskRequestBody;
    const validationError = validateAskInput(body);
    if (validationError) {
      return NextResponse.json<AskResponseBody>(
        { error: validationError },
        { status: 400 },
      );
    }

    const contextPrompt = await getAgentContextPrompt(request.nextUrl.pathname, body);

    const { answer } = await callGeminiWithFallback(GEMINI_PRIMARY_MODEL, {
      parts: buildParts(body),
      systemPrompt: contextPrompt || undefined,
    });

    return NextResponse.json<AskResponseBody>({ answer });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Не удалось связаться с Gemini API.";
    return NextResponse.json<AskResponseBody>({ error: message }, { status: 502 });
  }
}
