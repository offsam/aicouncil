import { NextRequest, NextResponse } from "next/server";
import {
  AskRequestBody,
  AskResponseBody,
  parseAnthropicError,
  validateAskInput,
} from "@/lib/api-types";
import { anthropicUsage } from "@/lib/tokens";
import { getAgentContextPrompt } from "@/lib/entity-registry";

const MODEL = "claude-sonnet-4-6";

type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    };

function buildContent(body: AskRequestBody): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const question = body.question?.trim();

  if (body.imageBase64) {
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: body.imageMediaType || "image/jpeg",
        data: body.imageBase64,
      },
    });
  }

  blocks.push({
    type: "text",
    text: question || "Опиши изображение и ответь на возможные вопросы по нему.",
  });

  return blocks;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json<AskResponseBody>(
        { error: "ANTHROPIC_API_KEY не настроен на сервере." },
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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: contextPrompt || undefined,
        messages: [
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
        { error: parseAnthropicError(response.status, data) },
        { status: response.status },
      );
    }

    const textBlock = (
      data as { content?: Array<{ type: string; text?: string }> }
    ).content?.find((block) => block.type === "text");

    const answer = textBlock?.text?.trim();
    if (!answer) {
      return NextResponse.json<AskResponseBody>(
        { error: "Claude вернул пустой ответ." },
        { status: 502 },
      );
    }

    return NextResponse.json<AskResponseBody>({
      answer,
      usage: anthropicUsage(data),
    });
  } catch {
    return NextResponse.json<AskResponseBody>(
      { error: "Не удалось связаться с Anthropic API." },
      { status: 500 },
    );
  }
}
