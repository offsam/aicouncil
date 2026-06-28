import { chromium } from "playwright";
import { workspaceChatInput, workspaceChatSend } from "../scripts/evidence-utils";

const BASE = "http://127.0.0.1:3000";

async function openChatFast(page: any) {
  await page.keyboard.press("Escape");
  await page.locator('[aria-label="Закрыть панель"]').click({ force: true, timeout: 500 }).catch(() => undefined);
  await page.locator('[data-testid="workspace-inspector-close"]').click({ force: true, timeout: 500 }).catch(() => undefined);
  
  const dock = page.locator('[data-testid="workspace-mayor-chat"]');
  if ((await dock.count()) === 0) {
    await page.locator('[data-testid="workspace-chat-launcher"]').click({ force: true });
    await dock.waitFor({ state: "visible", timeout: 2000 });
  }
  const messages = dock.locator(".workspace-chat-dock-messages");
  if ((await messages.count()) === 0) {
    await page.locator('[data-testid="workspace-mayor-chat-expand"]').click();
    await messages.waitFor({ state: "visible", timeout: 2000 }).catch(() => undefined);
  }
}

async function main() {
  console.log("=== STARTING RENDER LOOP DEBUGGER ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  // Print all console logs
  page.on("console", (msg) => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });

  // Print all page errors (uncaught exceptions)
  page.on("pageerror", (err) => {
    console.log(`[Browser PageError] ${err.message}\nStack: ${err.stack}`);
  });

  // Navigate to workspace page
  console.log("Navigating to /workspace...");
  try {
    await page.goto(`${BASE}/workspace`, { waitUntil: "load", timeout: 15000 });
  } catch (err) {
    console.log("Navigation timed out, but proceeding anyway...");
  }

  // Wait for the workspace chat launcher to be visible
  console.log("Waiting for chat launcher to load...");
  try {
    await page.waitForSelector('[data-testid="workspace-chat-launcher"]', { timeout: 5000 });
    console.log("Chat launcher loaded successfully.");
  } catch (err) {
    console.log("Failed to find chat launcher within 5 seconds.");
  }

  // Open chat dock
  console.log("Opening chat...");
  await openChatFast(page);

  // Send a task that triggers routing
  const taskText = "Зайди в Instagram и спроси о правилах";
  console.log(`Sending task: "${taskText}"`);
  const chatInput = workspaceChatInput(page);
  await chatInput.fill(taskText);
  await page.waitForTimeout(200);

  const chatSend = workspaceChatSend(page);
  await chatSend.click();

  // Wait 35 seconds to capture logs
  console.log("Waiting 35 seconds to capture render loop console logs...");
  await page.waitForTimeout(35000);

  await browser.close();
  console.log("=== RENDER LOOP DEBUGGER DONE ===");
}

main().catch(err => {
  console.error(err);
});
