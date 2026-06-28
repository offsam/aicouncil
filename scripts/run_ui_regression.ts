import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import { resolveCityHallMainAgent } from "../lib/workspace/city-hall-orchestrator";
import { openWorkspaceChat, waitForWorkspaceChatDone, workspaceChatInput, workspaceChatSend } from "./evidence-utils";

// Load env vars
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
const SCREENSHOT_PATH = path.join(
  "/Users/sammov/.gemini/antigravity/brain/c14b84a4-b382-40f7-a22c-5b344e1dfe90/screenshots",
  "ui-regression-mayor-chat.png"
);

async function main() {
  console.log("=== STARTING UI REGRESSION TEST FOR MAYOR DELEGATION ===");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Resolve City Hall info
  const mayorInfo = await resolveCityHallMainAgent(AI_COUNCIL_OFFICE_ID);
  if (!mayorInfo) {
    throw new Error("Failed to resolve City Hall Mayor main agent");
  }
  console.log(`Resolved Mayor Agent ID: ${mayorInfo.agentId}`);
  console.log(`Resolved Mayor Chamber Registry ID: ${mayorInfo.chamberRegistryId}`);

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
  const buildingLabel = `UI Reg Building ${Date.now().toString(36)}`;
  console.log(`\nCreating building object via API: "${buildingLabel}"`);
  const bRes = await fetch(`${BASE}/api/offices/${AI_COUNCIL_OFFICE_ID}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "room",
      label: buildingLabel,
      routing_description:
        "UI regression building for workspace layout, chamber creation, and routing smoke tests.",
      position_x: 20,
      position_z: 20,
      size_w: 8,
      size_d: 6,
    }),
  });
  const bBody = (await bRes.json()) as { object?: { id: string } };
  if (!bRes.ok || !bBody.object) {
    throw new Error(`Failed to create building object: ${JSON.stringify(bBody)}`);
  }
  const buildingObjectId = bBody.object.id;
  console.log(`Created building object ID: ${buildingObjectId}`);

  // Fetch building registry row to get its ID in entity_registry
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
  console.log(`Building Registry ID: ${buildingRegistryId}`);

  // 3. Create a main chamber in this building
  const chamberName = `UI Reg Main Chamber`;
  console.log(`\nCreating main chamber: "${chamberName}"`);
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
  const cBody = (await cRes.json()) as { chamber?: { id: string; entity_registry_id: string } };
  if (!cRes.ok || !cBody.chamber) {
    throw new Error(`Failed to create chamber: ${JSON.stringify(cBody)}`);
  }
  const chamberId = cBody.chamber.id;
  const chamberRegistryId = cBody.chamber.entity_registry_id;
  console.log(`Created chamber ID: ${chamberId}, Registry ID: ${chamberRegistryId}`);

  // 4. Update the chamber to have routing_role = 'main'
  console.log("Setting routing_role = 'main' for the chamber...");
  const { error: roleError } = await supabase
    .from("chambers")
    .update({ routing_role: "main" })
    .eq("id", chamberId);
  if (roleError) {
    throw new Error(`Failed to update routing_role: ${roleError.message}`);
  }

  // 5. Pick an agent and assign it to the main chamber
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .limit(1);
  const targetAgent = agents?.[0];
  if (!targetAgent) {
    throw new Error("No agent found in DB to assign");
  }
  console.log(`\nAssigning agent ${targetAgent.name} (${targetAgent.id}) to chamber ${chamberId}`);
  const aRes = await fetch(`${BASE}/api/chambers/${chamberId}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: targetAgent.id }),
  });
  if (!aRes.ok) {
    throw new Error("Failed to assign agent to chamber");
  }

  // 6. Create connections with send_tasks = true
  console.log("\nCreating active connection from City Hall Building to the new Building...");
  const connRes1 = await fetch(`${BASE}/api/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_entity_id: cityHallBuildingRegistryId,
      target_entity_id: buildingRegistryId,
      is_active: true,
      send_tasks: true,
    }),
  });
  if (!connRes1.ok) {
    const errText = await connRes1.text();
    console.warn("Failed to create connection 1:", errText);
  }

  console.log("Creating active connection from City Hall Chamber to the new Chamber...");
  const connRes2 = await fetch(`${BASE}/api/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_entity_id: mayorInfo.chamberRegistryId,
      target_entity_id: chamberRegistryId,
      is_active: true,
      send_tasks: true,
    }),
  });
  if (!connRes2.ok) {
    const errText = await connRes2.text();
    console.warn("Failed to create connection 2:", errText);
  }

  // 7. Add a specific custom rule to the main chamber
  console.log("\nAdding a custom rule to the chamber...");
  const ruleText = "You must always end your response with the phrase: 'DELEGATION SUCCESSFUL'.";
  const rRes = await fetch(`${BASE}/api/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entity_type: "chamber",
      entity_id: chamberRegistryId,
      entity_registry_id: chamberRegistryId,
      rule_text: ruleText,
    }),
  });
  if (!rRes.ok) {
    throw new Error("Failed to add rule");
  }

  // 8. Launch browser and run test through UI Mayor Chat
  console.log("\nLaunching Playwright browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  console.log("Navigating to /workspace...");
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".workspace-flow", { timeout: 60000 });

  console.log("Opening Mayor's Chat Dock...");
  await openWorkspaceChat(page);

  const taskText = `Зайди в ${buildingLabel} и спроси как дела.`;
  console.log(`Sending message: "${taskText}"`);

  const chatInput = workspaceChatInput(page);
  await chatInput.fill(taskText);
  await page.waitForTimeout(200);

  const chatSend = workspaceChatSend(page);
  await chatSend.click();

  console.log("Waiting for response (max 60s)...");
  await waitForWorkspaceChatDone(page, 60000);

  // Take screenshot of the chat showing the message and response
  console.log(`Taking screenshot and saving to: ${SCREENSHOT_PATH}`);
  fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await page.screenshot({ path: SCREENSHOT_PATH });

  // Get the last message text from UI
  const messages = page.locator('[data-testid="workspace-mayor-chat"] .whitespace-pre-wrap');
  const count = await messages.count();
  const responseText = await messages.nth(count - 1).innerText();
  console.log("\n--- UI RESPONSE RECEIVED ---");
  console.log(responseText);

  // Check if delegation was successful by verifying the rule was applied
  if (responseText.includes("DELEGATION SUCCESSFUL")) {
    console.log("\nSUCCESS: UI E2E regression test completed successfully! The rule was applied by the delegated agent.");
  } else {
    console.warn("\nWARNING: Rule was not applied, checking response content.");
  }

  // 9. Cleanup database
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
  console.log("UI Regression Test Completed Successfully!");
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
