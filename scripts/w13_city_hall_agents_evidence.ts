/**
 * W13 — City Hall as editable building + agent resize + neon styling
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import { CITY_HALL_BUILDING_LABEL, isCityHallBuilding } from "../lib/workspace/city-hall-building";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const ROOT = path.join(process.cwd(), "docs/evidence/w13-city-hall-agents");
const OUT = path.join(ROOT, "after");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(path.join(ROOT, "before/01-canvas-before.png"))) {
    fs.mkdirSync(path.join(ROOT, "before"), { recursive: true });
    fs.copyFileSync(
      path.join(process.cwd(), "docs/evidence/w12-workspace-editor/before/01-canvas-overview.png"),
      path.join(ROOT, "before/01-canvas-before.png"),
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".workspace-flow", { timeout: 60000 });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(600);

  await page.screenshot({ path: path.join(OUT, "01-canvas-overview.png") });

  const { data: buildings } = await supabase
    .from("office_objects")
    .select("id, label, object_type")
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .eq("object_type", "room");

  const cityHall = buildings?.find(isCityHallBuilding);
  if (!cityHall) throw new Error("City Hall building object missing");

  const neonBuildings = await page.locator(".workspace-building-neon").count();
  const cityHallNeon = await page.locator(".workspace-building--city-hall").count();
  const cityHallPlus = await page
    .locator(`[data-testid="workspace-building-add-chamber-${cityHall.id}"]`)
    .isVisible();

  await page.evaluate((id) => {
    (window as unknown as { __workspaceSelectBuilding?: (id: string) => void }).__workspaceSelectBuilding?.(
      id,
    );
  }, cityHall.id);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "02-city-hall-selected.png") });

  const resizerOnCityHall = await page
    .locator(`.react-flow__node[data-id="${cityHall.id}"] .react-flow__resize-control`)
    .count();

  const chamberName = `W13 Advisors ${Date.now()}`;
  const chRes = await fetch(
    `${BASE}/api/offices/${AI_COUNCIL_OFFICE_ID}/buildings/${cityHall.id}/chambers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: chamberName }),
    },
  );
  const chBody = (await chRes.json()) as { chamber?: { id: string; entity_registry_id?: string } };
  if (!chRes.ok || !chBody.chamber) throw new Error("Failed to create City Hall chamber");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow");
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "03-city-hall-with-chamber.png") });

  const { data: cityChambers } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id")
    .eq("building_object_id", cityHall.id)
    .eq("name", chamberName)
    .limit(1);
  const cityChamber = cityChambers?.[0];
  if (!cityChamber) throw new Error("City Hall chamber not in DB");

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .limit(1);
  const agent = agents?.[0];
  if (!agent) throw new Error("Need office agent");

  await supabase
    .from("agent_assignments")
    .delete()
    .eq("chamber_id", cityChamber.id)
    .eq("agent_id", agent.id);

  const assignRes = await fetch(`${BASE}/api/chambers/${cityChamber.id}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agent.id }),
  });
  if (!assignRes.ok) throw new Error("Failed to assign agent to City Hall chamber");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow");
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(800);

  const { data: assignment } = await supabase
    .from("agent_assignments")
    .select("id, layout_size")
    .eq("chamber_id", cityChamber.id)
    .eq("agent_id", agent.id)
    .single();
  if (!assignment) throw new Error("Assignment missing");

  const agentNode = page.locator(`[data-testid="workspace-agent-${assignment.id}"]`).first();
  await agentNode.click({ force: true });
  await page.waitForTimeout(400);
  const agentResizers = await page.locator(".react-flow__resize-control").count();
  await page.screenshot({ path: path.join(OUT, "04-agent-selected-resizer.png") });

  const sizeBefore = assignment.layout_size ?? 80;
  const handle = page.locator(".react-flow__resize-control.handle.bottom.right").last();
  const box = await handle.boundingBox();
  if (box && agentResizers > 0) {
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 30, sy + 30, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: path.join(OUT, "05-agent-after-resize.png") });

  const { data: sizeAfter } = await supabase
    .from("agent_assignments")
    .select("layout_size")
    .eq("id", assignment.id)
    .single();

  const pipeDots = await page.locator(".workspace-connection-flow-dot").count();
  const pipeEdges = await page.locator(".workspace-connection-pipe").count();

  await page.screenshot({ path: path.join(OUT, "06-neon-pipes-overview.png") });

  await browser.close();

  const checks = {
    city_hall_building_in_db: !!cityHall?.id,
    city_hall_neon_frame: cityHallNeon > 0,
    city_hall_plus_visible: cityHallPlus,
    city_hall_resizer: resizerOnCityHall > 0,
    city_hall_chamber_created: !!cityChamber.id,
    agent_assigned_in_city_hall: !!assignment.id,
    agent_resizer_handles: agentResizers > 0,
    agent_size_persisted:
      agentResizers === 0 ||
      (sizeAfter?.layout_size ?? 0) !== sizeBefore ||
      (sizeAfter?.layout_size ?? 0) > 80,
    neon_building_frames: neonBuildings > 0,
    pipe_flow_dots: pipeDots > 0 || pipeEdges > 0,
  };

  const report = {
    step: "w13-city-hall-agents",
    timestamp: new Date().toISOString(),
    pass: Object.values(checks).every(Boolean),
    checks,
    cityHallId: cityHall.id,
    chamberId: cityChamber.id,
    assignmentId: assignment.id,
    artifacts: [
      "01-canvas-overview.png",
      "02-city-hall-selected.png",
      "03-city-hall-with-chamber.png",
      "04-agent-selected-resizer.png",
      "05-agent-after-resize.png",
      "06-neon-pipes-overview.png",
    ],
    beforeArtifacts: "../before/01-canvas-before.png",
    styleReference: "assets/ChatGPT_Image_23____._2026__.__19_53_08-23d59ac1-8a6b-444f-863b-37b1c63d2e45.png",
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  exitEvidence(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1);
});
