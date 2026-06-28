import { NextRequest, NextResponse } from "next/server";
import {
  AskRequestBody,
  AskResponseBody,
  validateAskInput,
} from "@/lib/api-types";
import {
  callGroqWithFallback,
  GROQ_PRIMARY_MODEL,
  GROQ_VISION_MODEL,
  type GroqMessageContent,
} from "@/lib/groq-models";
import { getAgentContextPrompt } from "@/lib/entity-registry";

function buildContent(body: AskRequestBody): GroqMessageContent[] {
  const content: GroqMessageContent[] = [];
  const question = body.question?.trim();

  if (body.imageBase64) {
    const mediaType = body.imageMediaType || "image/jpeg";
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${mediaType};base64,${body.imageBase64}`,
      },
    });
  }

  content.push({
    type: "text",
    text: question || "Опиши изображение и ответь на возможные вопросы по нему.",
  });

  return content;
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

    const primaryModel = body.imageBase64 ? GROQ_VISION_MODEL : GROQ_PRIMARY_MODEL;
    const contextPrompt = await getAgentContextPrompt(request.nextUrl.pathname, body);

    const messages = [
      ...(contextPrompt ? [{ role: "system" as const, content: contextPrompt }] : []),
      {
        role: "user" as const,
        content: buildContent(body),
      },
    ];

    const { answer } = await callGroqWithFallback(primaryModel, messages);

    return NextResponse.json<AskResponseBody>({ answer });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Не удалось связаться с Groq API.";
    return NextResponse.json<AskResponseBody>({ error: message }, { status: 502 });
  }
}
