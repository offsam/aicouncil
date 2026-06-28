import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3001";
const OUT_DIR = "/Users/sammov/.gemini/antigravity/brain/c14b84a4-b382-40f7-a22c-5b344e1dfe90/screenshots";

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  console.log("Loading workspace...");
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(1000);

  // --- 1. 2D Workspace Overview ---
  console.log("Capturing 2D Workspace overview...");
  await page.screenshot({ path: path.join(OUT_DIR, "evidence-2d-workspace.png") });

  // --- 2. Drag Agent ---
  console.log("Testing Drag Agent...");
  // Agent Node ID: assignment-bbcec278-4070-4093-a3a3-c44332b1a5dd
  const agentNode = page.locator('.react-flow__node[data-id="assignment-bbcec278-4070-4093-a3a3-c44332b1a5dd"]');
  await agentNode.waitFor({ timeout: 5000 });
  let box = await agentNode.boundingBox();
  if (box) {
    await page.screenshot({ path: path.join(OUT_DIR, "drag-agent-01-before.png") });
    
    // Drag agent node
    const startX = box.x + box.width / 2;
    const startY = box.y + 10;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 20, startY - 15, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "drag-agent-02-after.png") });

    // Reload page
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "drag-agent-03-reload.png") });
  }

  // --- 3. Resize Building ---
  console.log("Testing Resize Building...");
  const buildingNode = page.locator('.react-flow__node[data-id="49818398-fa26-49fa-ab3d-5e088622019f"]');
  await buildingNode.click({ force: true });
  await page.waitForTimeout(500);
  const bResizer = page.locator('.react-flow__node.selected .react-flow__resize-control.bottom.right');
  box = await bResizer.boundingBox();
  if (box) {
    await page.screenshot({ path: path.join(OUT_DIR, "resize-building-01-before.png") });
    const rx = box.x + box.width / 2;
    const ry = box.y + box.height / 2;
    await page.mouse.move(rx, ry);
    await page.mouse.down();
    await page.mouse.move(rx + 48, ry + 48, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "resize-building-02-after.png") });

    // Reload page
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(1000);
    // Click again to show the resized state outline
    await page.locator('.react-flow__node[data-id="49818398-fa26-49fa-ab3d-5e088622019f"]').click({ force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "resize-building-03-reload.png") });
  }

  // --- 4. Resize Chamber ---
  console.log("Testing Resize Chamber...");
  const chamberNode = page.locator('.react-flow__node[data-id="9bbe9fe4-bfbc-414e-b7a2-f0c15f5037d5"]');
  await chamberNode.click({ force: true });
  await page.waitForTimeout(500);
  const cResizer = page.locator('.react-flow__node.selected .react-flow__resize-control.bottom.right');
  box = await cResizer.boundingBox();
  if (box) {
    await page.screenshot({ path: path.join(OUT_DIR, "resize-chamber-01-before.png") });
    const rx = box.x + box.width / 2;
    const ry = box.y + box.height / 2;
    await page.mouse.move(rx, ry);
    await page.mouse.down();
    await page.mouse.move(rx + 24, ry + 24, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "resize-chamber-02-after.png") });

    // Reload page
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(1000);
    await page.locator('.react-flow__node[data-id="9bbe9fe4-bfbc-414e-b7a2-f0c15f5037d5"]').click({ force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "resize-chamber-03-reload.png") });
  }

  // --- 5. Resize Agent ---
  console.log("Testing Resize Agent...");
  const aNode = page.locator('.react-flow__node[data-id="assignment-bbcec278-4070-4093-a3a3-c44332b1a5dd"]');
  await aNode.click({ force: true });
  await page.waitForTimeout(500);
  const aResizer = page.locator('.react-flow__node.selected .react-flow__resize-control.bottom.right');
  box = await aResizer.boundingBox();
  if (box) {
    await page.screenshot({ path: path.join(OUT_DIR, "resize-agent-01-before.png") });
    const rx = box.x + box.width / 2;
    const ry = box.y + box.height / 2;
    await page.mouse.move(rx, ry);
    await page.mouse.down();
    await page.mouse.move(rx + 16, ry + 16, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "resize-agent-02-after.png") });

    // Reload page
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(1000);
    await page.locator('.react-flow__node[data-id="assignment-bbcec278-4070-4093-a3a3-c44332b1a5dd"]').click({ force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "resize-agent-03-reload.png") });
  }

  // --- 6. Manual Route Path & Auto-route ---
  console.log("Capturing routing types...");
  // Fit view and deselect everything
  await page.locator('.react-flow__renderer').click({ position: { x: 10, y: 10 }, force: true });
  await page.waitForTimeout(500);
  
  // screenshot showing overall cabling (auto vs manual)
  await page.screenshot({ path: path.join(OUT_DIR, "evidence-cabling-types.png") });

  // Let's click on the manual connection edge to highlight it:
  // Edge ID: connection-183b52d2-afdd-4a56-a68d-f4540ea6db9e
  const manualEdge = page.locator('.react-flow__edge[data-id="connection-183b52d2-afdd-4a56-a68d-f4540ea6db9e"] path.react-flow__edge-path');
  if (await manualEdge.count() > 0) {
    await manualEdge.first().click({ force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, "evidence-manual-route.png") });
  }

  // --- 7. Mixed Connections on City Hall ---
  console.log("Capturing mixed connections on City Hall...");
  // Focus view near City Hall building (ID: aa5c2d68-cf23-4290-b9fa-3f83446c1a4f)
  const cityHallNode = page.locator('.react-flow__node[data-id="aa5c2d68-cf23-4290-b9fa-3f83446c1a4f"]');
  box = await cityHallNode.boundingBox();
  if (box) {
    await page.screenshot({ path: path.join(OUT_DIR, "evidence-mixed-connections.png") });
  }

  // --- 8. Multiple Connections ---
  console.log("Capturing multiple connections...");
  await page.screenshot({ path: path.join(OUT_DIR, "evidence-multiple-connections.png") });

  await browser.close();
  console.log("All evidence screenshots captured successfully!");
}

main().catch(console.error);
