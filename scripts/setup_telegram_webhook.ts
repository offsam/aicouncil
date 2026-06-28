/**
 * Register Telegram webhook (requires public HTTPS URL).
 * Usage: NEXT_PUBLIC_APP_URL=https://your-host npx tsx scripts/setup_telegram_webhook.ts
 */
import * as fs from "fs";
import { resolveAppBaseUrl } from "../lib/telegram/app-base-url";
import { getTelegramBotToken, getTelegramWebhookSecret } from "../lib/telegram/bot-api";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function main() {
  const token = getTelegramBotToken();
  const secret = getTelegramWebhookSecret();
  if (!token || !secret) {
    console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local");
    process.exit(1);
  }

  const base = resolveAppBaseUrl();
  if (!base.startsWith("https://")) {
    console.error(
      "Webhook requires HTTPS public URL. Set NEXT_PUBLIC_APP_URL=https://... (ngrok/Vercel).",
      "Current base:",
      base,
    );
    process.exit(2);
  }

  const webhookUrl = `${base}/api/telegram/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message"],
    }),
  });
  const body = await res.json();
  console.log(JSON.stringify({ webhookUrl, response: body }, null, 2));
  if (!body.ok) process.exit(1);
}

main();
