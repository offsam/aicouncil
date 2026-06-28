import { formatTelegramMayorConversationId } from "@/lib/mayor-conversation-memory";
import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { getTelegramBotToken, getTelegramWebhookSecret, telegramSendMessage } from "@/lib/telegram/bot-api";
import { extractChatAnswer, postMayorChatViaApi } from "@/lib/telegram/internal-chat";
import { toUserFacingProviderError } from "@/lib/provider-user-error";
import { resolveMayorChatTarget } from "@/lib/telegram/mayor-chat-target";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number };
    text?: string;
  };
};

function verifyTelegramSecret(request: NextRequest): boolean {
  const expected = getTelegramWebhookSecret();
  if (!expected) return false;
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  return header === expected;
}

export async function POST(request: NextRequest) {
  if (!verifyTelegramSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim();
  if (chatId == null || !text) {
    return NextResponse.json({ ok: true, skipped: "no text message" });
  }

  try {
    const mayor = await resolveMayorChatTarget();
    if (!mayor) {
      await telegramSendMessage(chatId, "Мэр не найден в базе (City Hall / main chamber).");
      return NextResponse.json({ ok: true, error: "mayor_not_found" });
    }

    const result = await postMayorChatViaApi({
      taskText: text,
      targetAgentId: mayor.targetAgentId,
      directTargetEntityId: mayor.directTargetEntityId,
      conversationId: formatTelegramMayorConversationId(chatId),
    });

    const answer = extractChatAnswer(result);
    if (!answer) {
      await telegramSendMessage(chatId, "Пустой ответ от /api/chat.");
      return NextResponse.json({ ok: true, error: "empty_answer" });
    }

    await telegramSendMessage(chatId, answer);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = toUserFacingProviderError(err);
    console.error("[telegram/webhook]", err instanceof Error ? err.message : err);
    try {
      await telegramSendMessage(chatId, message);
    } catch {
      /* ignore secondary failure */
    }
    return NextResponse.json({ ok: true, error: message });
  }
}
