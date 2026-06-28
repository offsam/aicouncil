import { NextRequest, NextResponse } from "next/server";
import {
  AskRequestBody,
  AskResponseBody,
  parseOpenAIError,
  validateAskInput,
} from "@/lib/api-types";
import { openAIUsage } from "@/lib/tokens";
import { getAgentContextPrompt } from "@/lib/entity-registry";

const MODEL = "gpt-4o";

type MessageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function buildContent(body: AskRequestBody): MessageContent[] {
  const content: MessageContent[] = [];
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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json<AskResponseBody>(
        { error: "OPENAI_API_KEY не настроен на сервере." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as AskRequestBody;
    const validationError = validateAskInput(body);
    if (validationError) {
      return NextResponse.json<AskResponseBody>(
        { error: validationError },
        { status: 400 },
      );
    }

    const contextPrompt = await getAgentContextPrompt(request.nextUrl.pathname, body);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        messages: [
          ...(contextPrompt ? [{ role: "system", content: contextPrompt }] : []),
          {
            role: "user",
            content: buildContent(body),
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json<AskResponseBody>(
        { error: parseOpenAIError(response.status, data) },
        { status: response.status },
      );
    }

    const answer = (
      data as { choices?: Array<{ message?: { content?: string } }> }
    ).choices?.[0]?.message?.content?.trim();

    if (!answer) {
      return NextResponse.json<AskResponseBody>(
        { error: "GPT вернул пустой ответ." },
        { status: 502 },
      );
    }

    return NextResponse.json<AskResponseBody>({
      answer,
      usage: openAIUsage(data),
    });
  } catch {
    return NextResponse.json<AskResponseBody>(
      { error: "Не удалось связаться с OpenAI API." },
      { status: 500 },
    );
  }
}
