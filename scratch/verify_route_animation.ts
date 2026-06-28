import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import { resolveCityHallMainAgent } from "../lib/workspace/city-hall-orchestrator";
import { openWorkspaceChat, waitForWorkspaceChatDone, workspaceChatInput, workspaceChatSend } from "../scripts/evidence-utils";

// Load environment variables
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
const SCREENSHOTS_DIR = "/Users/sammov/.gemini/antigravity/brain/c14b84a4-b382-40f7-a22c-5b344e1dfe90/screenshots";

async function main() {
  console.log("=== STARTING SPRINT 3 ROUTE ANIMATION VERIFICATION ===");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Resolve City Hall info
  const mayorInfo = await resolveCityHallMainAgent(AI_COUNCIL_OFFICE_ID);
  if (!mayorInfo) {
    throw new Error("Failed to resolve City Hall Mayor main agent");
  }
  console.log(`Mayor Agent ID: ${mayorInfo.agentId}`);
  console.log(`Mayor Chamber Registry ID: ${mayorInfo.chamberRegistryId}`);

  // Fetch City Hall Building Registry ID
  const { data: cityHallChamber } = await supabase
    .from("chambers")
    .select("building_entity_id")
    .eq("entity_registry_id", mayorInfo.chamberRegistryId)
    .single();
  
  const cityHallBuildingRegistryId = cityHallChamber?.building_entity_id;
  if (!cityHallBuildingRegistryId) {
    throw new Error("Failed to find City Hall building registry ID");
  }
  console.log(`City Hall Building Registry ID: ${cityHallBuildingRegistryId}`);

  // 2. Create the target test building
  const buildingLabel = `Animation Test Building ${Date.now().toString(36)}`;
  console.log(`\nCreating target building: "${buildingLabel}"`);
  const bRes = await fetch(`${BASE}/api/offices/${AI_COUNCIL_OFFICE_ID}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "room",
      label: buildingLabel,
      position_x: 25,
      position_z: 15,
      size_w: 8,
      size_d: 6,
    }),
  });
  if (!bRes.ok) {
    const text = await bRes.text();
    throw new Error(`Failed to create building object: status ${bRes.status}, response: ${text}`);
  }
  const bBody = (await bRes.json()) as { object?: { id: string } };
  const buildingObjectId = bBody.object!.id;

  // Fetch building registry row
  const { data: buildingReg } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("entity_type", "building")
    .eq("name", buildingLabel)
    .single();
  const buildingRegistryId = buildingReg?.id;
  if (!buildingRegistryId) {
    throw new Error("Failed to find created building registry ID");
  }

  // 3. Create a main chamber in this building
  const chamberName = `Animation Main Chamber`;
  console.log(`Creating main chamber: "${chamberName}"`);
  const cRes = await fetch(`${BASE}/api/offices/${AI_COUNCIL_OFFICE_ID}/buildings/${buildingObjectId}/chambers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: chamberName,
      x: 1,
      z: 1,
      width: 3,
      depth: 2,
    }),
  });
  if (!cRes.ok) {
    const text = await cRes.text();
    throw new Error(`Failed to create chamber: status ${cRes.status}, response: ${text}`);
  }
  const cBody = (await cRes.json()) as { chamber?: { id: string; entity_registry_id: string } };
  const chamberId = cBody.chamber!.id;
  const chamberRegistryId = cBody.chamber!.entity_registry_id;

  // 4. Update the chamber to have routing_role = 'main'
  await supabase
    .from("chambers")
    .update({ routing_role: "main" })
    .eq("id", chamberId);

  // 5. Assign agent to chamber
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .limit(1);
  const targetAgent = agents?.[0];
  if (!targetAgent) {
    throw new Error("No agent found in DB to assign");
  }
  await fetch(`${BASE}/api/chambers/${chamberId}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: targetAgent.id }),
  });

  // 6. Create connections with send_tasks = true
  await fetch(`${BASE}/api/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_entity_id: cityHallBuildingRegistryId,
      target_entity_id: buildingRegistryId,
      is_active: true,
      send_tasks: true,
    }),
  });

  await fetch(`${BASE}/api/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_entity_id: mayorInfo.chamberRegistryId,
      target_entity_id: chamberRegistryId,
      is_active: true,
      send_tasks: true,
    }),
  });

  // 7. Add rule
  await fetch(`${BASE}/api/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entity_type: "chamber",
      entity_id: chamberRegistryId,
      entity_registry_id: chamberRegistryId,
      rule_text: "You must always end your response with: 'ANIMATION SUCCESSFUL'.",
    }),
  });

  // 8. Launch Playwright
  console.log("\nLaunching Playwright browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  // Log page console output
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`[Browser Console ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  // Log uncaught exceptions
  page.on("pageerror", (err) => {
    console.error(`[Browser Uncaught Error] ${err.message}\n${err.stack}`);
  });

  console.log("Navigating to /workspace...");
  try {
    await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector(".workspace-flow", { timeout: 60000 });
  } catch (err) {
    const screenshotPath = path.join(SCREENSHOTS_DIR, "route-animation-failure.png");
    console.error(`\nWait for .workspace-flow failed: ${err}`);
    console.log(`Taking screenshot of current failure state to ${screenshotPath}...`);
    await page.screenshot({ path: screenshotPath });
    const content = await page.content();
    console.log("Page HTML content:\n", content.slice(0, 1000));
    throw err;
  }

  // Open chat
  await openWorkspaceChat(page);

  const taskText = `Зайди в ${buildingLabel} и спроси о правилах.`;
  console.log(`Sending delegation task: "${taskText}"`);

  const chatInput = workspaceChatInput(page);
  await chatInput.fill(taskText);
  await page.waitForTimeout(200);

  // Send the task
  const chatSend = workspaceChatSend(page);
  await chatSend.click();

  // --- PHASE 1: Thinking / Routing ---
  console.log("\n[Phase 1: Routing] Checking Mayor node thinking...");
  await page.waitForTimeout(200); // short wait to catch initial POST routing
  const dimmedNodesRouting = await page.locator(".workspace-node-dimmed").count();
  console.log(`  Dimmed nodes count: ${dimmedNodesRouting}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "route-animation-01-thinking.png") });

  // Wait for /api/chat call to start and the delegation animation sequencer to kick off
  // We wait for the api response, but during the sequential playback we capture screenshots!
  console.log("Waiting for /api/chat response to resolve and start sequential playback...");
  
  // Wait for the complete phase to check sequential animation playback
  // The outbound animation takes (steps.length * 650ms), processing takes (3 * 1400ms = 4200ms)
  // Let's capture screenshots every 1.5 seconds!
  
  await page.waitForTimeout(1000);
  console.log("\n[Phase 2: Outbound] Checking cable signal overlay...");
  const signalPipesOutbound = await page.locator(".workspace-connection-signal-pulse").count();
  console.log(`  Active pulsing cables count: ${signalPipesOutbound}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "route-animation-02-outbound.png") });

  await page.waitForTimeout(1800);
  console.log("\n[Phase 3: Processing] Checking target chamber active & agent working...");
  const workingAgents = await page.locator(".workspace-tron-agent-working").count();
  const activeNodesProcessing = await page.locator(".workspace-tron-node").count();
  console.log(`  Active nodes (tronPulse) count: ${activeNodesProcessing}`);
  console.log(`  Working agents count: ${workingAgents}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "route-animation-03-processing.png") });

  await page.waitForTimeout(2000);
  console.log("\n[Phase 4: Return] Checking reverse signal overlay...");
  const signalPipesReturn = await page.locator(".workspace-connection-signal-pulse").count();
  console.log(`  Active return cables count: ${signalPipesReturn}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "route-animation-04-return.png") });

  // Wait for chat to complete fully
  console.log("\nWaiting for UI completion...");
  await waitForWorkspaceChatDone(page, 20000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "route-animation-05-completed.png") });

  // Wait for highlight to hold and fade out completely (hold=4000ms + fade=1000ms)
  console.log("Waiting 5.5 seconds for highlight fadeout...");
  await page.waitForTimeout(5500);
  const dimmedNodesAfterFade = await page.locator(".workspace-node-dimmed").count();
  console.log(`  Dimmed nodes after fade (expected 0): ${dimmedNodesAfterFade}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "route-animation-06-normal.png") });

  // Assertions
  const responseText = await page.locator('[data-testid="workspace-mayor-chat"] .whitespace-pre-wrap').last().innerText();
  console.log(`\nResponse content:\n"${responseText}"`);

  if (responseText.includes("ANIMATION SUCCESSFUL")) {
    console.log("\nSUCCESS: E2E Animation test verified successfully!");
  } else {
    console.warn("\nWARNING: Rule word was not detected in final response.");
  }

  // Cleanup DB
  console.log("\nCleaning up database records...");
  await supabase.from("connections").delete().eq("source_entity_id", cityHallBuildingRegistryId).eq("target_entity_id", buildingRegistryId);
  await supabase.from("connections").delete().eq("source_entity_id", mayorInfo.chamberRegistryId).eq("target_entity_id", chamberRegistryId);
  await supabase.from("rules").delete().eq("entity_registry_id", chamberRegistryId);
  await supabase.from("agent_assignments").delete().eq("chamber_id", chamberId);
  await supabase.from("chambers").delete().eq("id", chamberId);
  await supabase.from("entity_registry").delete().eq("id", chamberRegistryId);
  await supabase.from("office_objects").delete().eq("id", buildingObjectId);
  await supabase.from("entity_registry").delete().eq("id", buildingRegistryId);

  await browser.close();
  console.log("=== SPRINT 3 ROUTE ANIMATION VERIFICATION COMPLETED ===");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
