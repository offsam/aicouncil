import { NextRequest, NextResponse } from "next/server";
import { AskResponseBody } from "@/lib/api-types";
import { callOpenRouterWithFallback, isAllowedFreeModel } from "@/lib/openrouter-free";
import { getAgentContextPrompt } from "@/lib/entity-registry";

interface OpenRouterAskBody {
  question?: string;
  model?: string;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json<AskResponseBody>(
        { error: "API ключ не настроен" },
        { status: 500 },
      );
    }

    const body = (await request.json()) as OpenRouterAskBody;
    const question = body.question?.trim();
    const model = body.model?.trim();

    if (!question) {
      return NextResponse.json<AskResponseBody>(
        { error: "Введите текстовый вопрос для OpenRouter." },
        { status: 400 },
      );
    }

    if (!model || !isAllowedFreeModel(model)) {
      return NextResponse.json<AskResponseBody>(
        { error: "Разрешены только бесплатные модели с суффиксом :free." },
        { status: 400 },
      );
    }

    const contextPrompt = await getAgentContextPrompt(request.nextUrl.pathname, body);

    const messages = [
      ...(contextPrompt ? [{ role: "system" as const, content: contextPrompt }] : []),
      { role: "user" as const, content: question },
    ];

    const { answer } = await callOpenRouterWithFallback(model, messages);

    return NextResponse.json<AskResponseBody>({
      answer,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Не удалось связаться с OpenRouter API.";
    return NextResponse.json<AskResponseBody>({ error: message }, { status: 502 });
  }
}
