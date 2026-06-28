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

  console.log("Setting up a custom route path for a connection to test single-end drag...");
  // Let's find an active connection. Let's use:
  // Source: 9c25e5f6-f308-47ed-8655-0dc42a96f5d3 (AI Consil / building-9c25e5f6)
  // Target: aa5c2d68-cf23-4290-b9fa-3f83446c1a4f (City Hall / building-aa5c2d68)
  const connectionId = "183b52d2-afdd-4a56-a68d-f4540ea6db9e";
  
  // Reset route path to a known custom value
  const testRoutePath = {
    version: 1,
    points: [
      { x: -2200, y: -4200 },
      { x: -2200, y: -3900 }
    ]
  };
  await supabase
    .from("connections")
    .update({ route_path: testRoutePath })
    .eq("id", connectionId);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  console.log("Loading workspace...");
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(1500);

  // Take screenshot before drag
  console.log("Taking screenshot before drag...");
  await page.screenshot({ path: path.join(OUT_DIR, "single-end-01-before.png") });

  // Locate the source building node (AI Consil: 9c25e5f6-f308-47ed-8655-0dc42a96f5d3)
  const sourceNode = page.locator('.react-flow__node[data-id="9c25e5f6-f308-47ed-8655-0dc42a96f5d3"]');
  await sourceNode.waitFor({ timeout: 10000 });
  
  let box = await sourceNode.boundingBox();
  if (!box) {
    console.error("Could not find source node bounding box");
    await browser.close();
    return;
  }

  // Drag the source node (moving only this end of the connection)
  console.log("Dragging source node...");
  const startX = box.x + box.width / 2;
  const startY = box.y + 15;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 150, startY + 100, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(1500); // wait for db save

  // Take screenshot after drag
  console.log("Taking screenshot after drag...");
  await page.screenshot({ path: path.join(OUT_DIR, "single-end-02-after-drag.png") });

  // Reload the page
  console.log("Reloading page...");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(1500);

  // Take screenshot after reload
  console.log("Taking screenshot after reload...");
  await page.screenshot({ path: path.join(OUT_DIR, "single-end-03-after-reload.png") });

  await browser.close();
  console.log("Single end drag verification complete!");
}

main().catch(console.error);
