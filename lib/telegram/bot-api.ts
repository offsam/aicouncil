const TELEGRAM_API = "https://api.telegram.org";

export function getTelegramBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function getTelegramWebhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
}

export async function telegramSendMessage(chatId: number | string, text: string): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN не настроен");
  }

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
    }),
  });

  const body = (await res.json()) as { ok?: boolean; description?: string };
  if (!res.ok || !body.ok) {
    throw new Error(body.description ?? `Telegram sendMessage failed (${res.status})`);
  }
}
