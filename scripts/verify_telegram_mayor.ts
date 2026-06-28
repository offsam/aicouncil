/**
 * Verify Telegram Mayor resolver + webhook secret gate.
 * Real Telegram round trip requires public HTTPS webhook — see scripts/setup_telegram_webhook.ts
 */
import * as fs from "fs";
import { resolveMayorChatTarget } from "../lib/telegram/mayor-chat-target";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function main() {
  const mayor = await resolveMayorChatTarget();
  console.log("=== Mayor resolver ===");
  console.log(JSON.stringify(mayor, null, 2));

  if (!mayor?.targetAgentId || !mayor.directTargetEntityId) {
    console.error("FAIL: resolver returned null ids");
    process.exit(1);
  }

  const base = process.env.VERIFY_BASE_URL?.trim() || "http://127.0.0.1:3002";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";

  console.log("\n=== Webhook secret gate ===");
  const noSecret = await fetch(`${base}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: { chat: { id: 1 }, text: "ping" } }),
  });
  console.log("without secret:", noSecret.status, await noSecret.text());

  const badSecret = await fetch(`${base}/api/telegram/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "wrong",
    },
    body: JSON.stringify({ message: { chat: { id: 1 }, text: "ping" } }),
  });
  console.log("wrong secret:", badSecret.status, await badSecret.text());

  const okSecret = await fetch(`${base}/api/telegram/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": secret,
    },
    body: JSON.stringify({ message: { chat: { id: 1 }, text: "ping" } }),
  });
  console.log("valid secret:", okSecret.status, await okSecret.text());

  console.log("\n=== Workspace-shaped /api/chat ===");
  const chat = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: "telegram sanity ping",
      targetAgentId: mayor.targetAgentId,
      directTargetEntityId: mayor.directTargetEntityId,
      executionMode: "fast",
    }),
  });
  const chatBody = await chat.json();
  console.log("status:", chat.status);
  console.log("method:", chatBody.routing?.method);
  console.log("answer preview:", String(chatBody.answer ?? chatBody.error).slice(0, 200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
