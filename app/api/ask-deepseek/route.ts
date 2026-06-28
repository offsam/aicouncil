import { NextRequest, NextResponse } from "next/server";
import {
  AskRequestBody,
  AskResponseBody,
  parseDeepSeekError,
  validateAskInput,
} from "@/lib/api-types";
import { openAIUsage } from "@/lib/tokens";
import { getAgentContextPrompt } from "@/lib/entity-registry";

const MODEL = "deepseek-chat";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json<AskResponseBody>(
        { error: "DEEPSEEK_API_KEY не настроен на сервере." },
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

    const question = body.question?.trim();
    let text =
      question || "Опиши изображение и ответь на возможные вопросы по нему.";

    if (body.imageBase64 && !question) {
      return NextResponse.json<AskResponseBody>(
        {
          error:
            "DeepSeek не поддерживает анализ изображений. Добавьте текстовый вопрос.",
        },
        { status: 400 },
      );
    }

    if (body.imageBase64 && question) {
      text = `${question}\n\n(Изображение прикреплено, но DeepSeek не поддерживает vision — ответь только по тексту вопроса.)`;
    }

    const contextPrompt = await getAgentContextPrompt(request.nextUrl.pathname, body);

    const response = await fetch("https://api.deepseek.com/chat/completions", {
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
          { role: "user", content: text }
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json<AskResponseBody>(
        { error: parseDeepSeekError(response.status, data) },
        { status: response.status },
      );
    }

    const answer = (
      data as { choices?: Array<{ message?: { content?: string } }> }
    ).choices?.[0]?.message?.content?.trim();

    if (!answer) {
      return NextResponse.json<AskResponseBody>(
        { error: "DeepSeek вернул пустой ответ." },
        { status: 502 },
      );
    }

    return NextResponse.json<AskResponseBody>({
      answer,
      usage: openAIUsage(data),
    });
  } catch {
    return NextResponse.json<AskResponseBody>(
      { error: "Не удалось связаться с DeepSeek API." },
      { status: 500 },
    );
  }
}
