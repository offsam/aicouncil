import { NextRequest, NextResponse } from "next/server";
import {
  AskRequestBody,
  AskResponseBody,
  parseOpenRouterError,
  validateAskInput,
} from "@/lib/api-types";
import { getAgentContextPrompt } from "@/lib/entity-registry";
import { openAIUsage } from "@/lib/tokens";

const TEXT_MODEL = "mistralai/mistral-small-3.1-24b-instruct";
const VISION_MODEL = "mistralai/pixtral-12b";

type MessageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function buildContent(body: AskRequestBody): MessageContent[] | string {
  const question = body.question?.trim();

  if (body.imageBase64) {
    const mediaType = body.imageMediaType || "image/jpeg";
    return [
      {
        type: "image_url",
        image_url: {
          url: `data:${mediaType};base64,${body.imageBase64}`,
        },
      },
      {
        type: "text",
        text: question || "Опиши изображение и ответь на возможные вопросы по нему.",
      },
    ];
  }

  return question || "Опиши изображение и ответь на возможные вопросы по нему.";
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json<AskResponseBody>(
        { error: "OPENROUTER_API_KEY не настроен на сервере." },
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
    const model = body.imageBase64 ? VISION_MODEL : TEXT_MODEL;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Council",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [
          ...(contextPrompt ? [{ role: "system", content: contextPrompt }] : []),
          { role: "user", content: buildContent(body) }
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json<AskResponseBody>(
        { error: parseOpenRouterError(response.status, data) },
        { status: response.status },
      );
    }

    const answer = (
      data as { choices?: Array<{ message?: { content?: string } }> }
    ).choices?.[0]?.message?.content?.trim();

    if (!answer) {
      return NextResponse.json<AskResponseBody>(
        { error: "Mistral вернул пустой ответ." },
        { status: 502 },
      );
    }

    return NextResponse.json<AskResponseBody>({
      answer,
      usage: openAIUsage(data),
    });
  } catch {
    return NextResponse.json<AskResponseBody>(
      { error: "Не удалось связаться с OpenRouter API." },
      { status: 500 },
    );
  }
}
