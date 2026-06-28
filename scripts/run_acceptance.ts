import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3001";
const OUT_DIR = "/Users/sammov/.gemini/antigravity/brain/c14b84a4-b382-40f7-a22c-5b344e1dfe90/screenshots";

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("Saving screenshots to:", OUT_DIR);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  // Monitor network requests to count PATCHes
  let patchCount = 0;
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/api/")) {
      patchCount++;
      console.log("PATCH request detected:", req.url());
    }
  });

  // --- Step 1: Open Workspace ---
  console.log("1. Loading workspace...");
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT_DIR, "01-workspace-loaded.png") });

  // --- Step 2: Drag Building (2D) ---
  console.log("2. Testing 2D Building Drag...");
  // Find a building node
  const buildingNode = page.locator('.react-flow__node[data-id="49818398-fa26-49fa-ab3d-5e088622019f"]');
  await buildingNode.waitFor({ timeout: 10000 });
  
  let box = await buildingNode.boundingBox();
  if (box) {
    // Screenshot before drag
    await page.screenshot({ path: path.join(OUT_DIR, "02-building-before-drag.png") });

    // Drag
    const startX = box.x + box.width / 2;
    const startY = box.y + 15; // drag from header band
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 80, { steps: 15 });
    
    // Screenshot during drag
    await page.screenshot({ path: path.join(OUT_DIR, "03-building-during-drag.png") });
    
    await page.mouse.up();
    await page.waitForTimeout(1000); // wait for DB patch
    
    // Screenshot after drag
    await page.screenshot({ path: path.join(OUT_DIR, "04-building-after-drag.png") });

    // Reload and check if preserved
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "05-building-after-reload.png") });
  }

  // --- Step 3: Drag Chamber (2D) ---
  console.log("3. Testing 2D Chamber Drag...");
  const chamberNode = page.locator('.react-flow__node[data-id="9bbe9fe4-bfbc-414e-b7a2-f0c15f5037d5"]');
  await chamberNode.waitFor({ timeout: 10000 });
  box = await chamberNode.boundingBox();
  if (box) {
    await page.screenshot({ path: path.join(OUT_DIR, "06-chamber-before-drag.png") });
    const startX = box.x + box.width / 2;
    const startY = box.y + 10;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 30, startY + 30, { steps: 10 });
    await page.screenshot({ path: path.join(OUT_DIR, "07-chamber-during-drag.png") });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "08-chamber-after-drag.png") });

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "09-chamber-after-reload.png") });
  }

  // --- Step 4: Resize Building (2D) ---
  console.log("4. Testing 2D Building Resize...");
  // Click on building to select it and activate resizer
  const bNode = page.locator('.react-flow__node[data-id="49818398-fa26-49fa-ab3d-5e088622019f"]');
  await bNode.click();
  await page.waitForTimeout(500);
  
  // Find bottom-right resizer handle
  const resizer = page.locator('.react-flow__handle-bottom.react-flow__handle-right');
  if ((await resizer.count()) > 0) {
    box = await resizer.boundingBox();
    if (box) {
      await page.screenshot({ path: path.join(OUT_DIR, "10-building-before-resize.png") });
      const rx = box.x + box.width / 2;
      const ry = box.y + box.height / 2;
      await page.mouse.move(rx, ry);
      await page.mouse.down();
      await page.mouse.move(rx + 48, ry + 48, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT_DIR, "11-building-after-resize.png") });

      await page.reload({ waitUntil: "networkidle" });
      await page.locator(".react-flow__controls-fitview").click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT_DIR, "12-building-after-resize-reload.png") });
    }
  }

  // --- Step 5: Test Confirmation Gates ---
  console.log("5. Testing Confirmation Gates...");
  // Open Mayor chat launcher
  const launcher = page.locator('[data-testid="workspace-chat-launcher"]');
  if ((await launcher.count()) > 0) {
    await launcher.click();
    await page.waitForTimeout(500);
  }

  const input = page.locator('[data-testid="workspace-mayor-chat-input"]');
  const sendBtn = page.locator('[data-testid="workspace-mayor-chat-send"]');

  // Fast Mode (default is usually Fast, let's verify if selector is set to Fast)
  console.log("  Testing Fast Mode (no gate)...");
  const fastRadio = page.locator('input[value="fast"]');
  if ((await fastRadio.count()) > 0) {
    await fastRadio.click({ force: true });
    await page.waitForTimeout(200);
  }
  await input.fill("Hello Fast Mode");
  await sendBtn.click();
  await page.waitForTimeout(1000);
  // Take screenshot showing it directly sent or executing
  await page.screenshot({ path: path.join(OUT_DIR, "13-fast-mode-submitted.png") });

  // Team Mode
  console.log("  Testing Team Mode (shows gate)...");
  const teamRadio = page.locator('input[value="team"]');
  if ((await teamRadio.count()) > 0) {
    await teamRadio.click({ force: true });
    await page.waitForTimeout(200);
  }
  await input.fill("Hello Team Mode");
  await sendBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT_DIR, "14-team-mode-gate.png") });
  
  // Close the gate
  const cancelBtn = page.locator('[data-testid="workspace-council-gate-cancel"]');
  if ((await cancelBtn.count()) > 0) {
    await cancelBtn.click();
    await page.waitForTimeout(500);
  }

  // Council Mode
  console.log("  Testing Council Mode (shows gate)...");
  const councilRadio = page.locator('input[value="council"]');
  if ((await councilRadio.count()) > 0) {
    await councilRadio.click({ force: true });
    await page.waitForTimeout(200);
  }
  await input.fill("Hello Council Mode");
  await sendBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT_DIR, "15-council-mode-gate.png") });
  
  if ((await cancelBtn.count()) > 0) {
    await cancelBtn.click();
    await page.waitForTimeout(500);
  }

  // --- Step 6: 3D Floor Cabling and Objects ---
  console.log("6. Loading 3D Floor Page...");
  await page.goto(`${BASE}/floor`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000); // let threejs render
  await page.screenshot({ path: path.join(OUT_DIR, "16-3d-floor-editor.png") });

  await browser.close();
  console.log("Acceptance tests execution complete! All screenshots saved.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
