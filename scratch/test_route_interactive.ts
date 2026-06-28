import * as fs from "fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";

const envPath = "./.env.local";
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const parts = line.split("=");
    if (parts.length >= 2) {
      process.env[parts[0].trim()] = parts.slice(1).join("=").trim();
    }
  }
}

const BASE = "http://127.0.0.1:3000";

async function main() {
  console.log("=== STARTING INTERACTIVE ROUTE DEBUG ===");
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    console.log(`[BROWSER CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  page.on("pageerror", (err) => {
    console.error("[BROWSER EXCEPTION]", err.message, err.stack);
  });

  page.on("request", (req) => {
    if (req.url().includes("/api/")) {
      console.log(`[API REQUEST] ${req.method()} ${req.url()}`);
    }
  });

  page.on("response", (res) => {
    if (res.url().includes("/api/")) {
      console.log(`[API RESPONSE] ${res.status()} ${res.url()}`);
    }
  });

  console.log("Navigating to /workspace...");
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  console.log("Page loaded. Waiting for .workspace-flow...");
  await page.waitForSelector(".workspace-flow");
  console.log("Workspace flow loaded.");

  // Open Chat
  const dock = page.locator('[data-testid="workspace-mayor-chat"]');
  if ((await dock.count()) === 0) {
    await page.locator('[data-testid="workspace-chat-launcher"]').click({ force: true });
    await dock.waitFor({ state: "visible" });
  }
  const expandBtn = page.locator('[data-testid="workspace-mayor-chat-expand"]');
  if (await expandBtn.isVisible()) {
    await expandBtn.click();
  }

  // Type and Send
  const textarea = page.locator('[data-testid="workspace-mayor-chat-input"]');
  const sendBtn = page.locator('[data-testid="workspace-mayor-chat-send"]');

  const text = "Зайди в Citizly и спроси о правилах";
  console.log(`Filling textarea with: "${text}"`);
  await textarea.fill(text);
  await page.waitForTimeout(500);

  const value = await textarea.inputValue();
  const isDisabled = await sendBtn.isDisabled();
  console.log(`Textarea value: "${value}", Send button disabled: ${isDisabled}`);

  console.log("Clicking send button...");
  await sendBtn.click();

  console.log("Waiting 10 seconds to observe requests and transitions...");
  await page.waitForTimeout(10000);

  const content = await page.content();
  console.log("Page contains 'Маршрутизация…':", content.includes("Маршрутизация…"));
  console.log("Page contains 'workspace-node-dimmed':", content.includes("workspace-node-dimmed"));

  const messages = await page.locator('[data-testid="workspace-mayor-chat"] .whitespace-pre-wrap').allTextContents();
  console.log("\nChat Messages in UI:");
  messages.forEach((msg, i) => {
    console.log(`[Message ${i + 1}] "${msg.trim()}"`);
  });

  await browser.close();
  console.log("=== DEBUG COMPLETED ===");
}

main().catch(err => {
  console.error("Debug script failed:", err);
  process.exit(1);
});
