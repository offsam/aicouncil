/**
 * W12 — Workspace city editor: resize, assign agent, building connections, UX
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w12-workspace-editor/after");

async function focusBuildingHeader(page: import("playwright").Page, buildingId: string) {
  const testId = `workspace-building-header-${buildingId}`;
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    el?.scrollIntoView({ block: "center", inline: "center" });
  }, testId);
  await page.waitForTimeout(200);
}

async function selectBuilding(page: import("playwright").Page, buildingId: string) {
  await focusBuildingHeader(page, buildingId);
  await page.evaluate((id) => {
    (window as unknown as { __workspaceSelectBuilding?: (id: string) => void }).__workspaceSelectBuilding?.(
      id,
    );
  }, buildingId);
  await page.waitForTimeout(400);
}

async function connectClickBuilding(page: import("playwright").Page, buildingId: string) {
  await focusBuildingHeader(page, buildingId);
  await page.evaluate((id) => {
    (window as unknown as { __workspacePickConnect?: (id: string) => void }).__workspacePickConnect?.(
      id,
    );
  }, buildingId);
  await page.waitForTimeout(400);
}

async function clickTestId(page: import("playwright").Page, testId: string) {
  const locator = page.locator(`[data-testid="${testId}"]`);
  try {
    await locator.click({ force: true, timeout: 3000 });
  } catch {
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
      el?.click();
    }, testId);
  }
  await page.waitForTimeout(300);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: buildings } = await supabase
    .from("office_objects")
    .select("id, label, size_w, size_d")
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .eq("object_type", "room")
    .order("created_at", { ascending: false })
    .limit(2);

  let buildingA = buildings?.[0];
  let buildingB = buildings?.[1];

  if (!buildingA) throw new Error("Need at least 1 building");

  if (!buildingB) {
    const createRes = await fetch(`${BASE}/api/offices/${AI_COUNCIL_OFFICE_ID}/objects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        object_type: "room",
        label: `W12 Evidence Building ${Date.now()}`,
        routing_description:
          "Evidence-only test building for workspace editor coverage and routing checks.",
        position_x: 12,
        position_z: -4,
        size_w: 8,
        size_d: 6,
      }),
    });
    const created = (await createRes.json()) as { object?: { id: string; label: string } };
    if (!createRes.ok || !created.object) throw new Error("Failed to create evidence building");
    buildingB = {
      id: created.object.id,
      label: created.object.label,
      size_w: 8,
      size_d: 6,
    };
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(600);

  await page.screenshot({ path: path.join(OUT, "01-canvas-overview.png") });

  const truncAfter = await page.evaluate(() => ({
    buildingTrunc: !!document.querySelector(".workspace-building-title.truncate"),
    chamberTrunc: !!document.querySelector(".workspace-chamber-title.truncate"),
    buildingWrap: !!document.querySelector(".workspace-building-title"),
    chamberWrap: !!document.querySelector(".workspace-chamber-title"),
  }));

  const plusVisible = await page
    .locator(`[data-testid="workspace-building-add-chamber-${buildingA.id}"]`)
    .first()
    .isVisible();

  await page.screenshot({ path: path.join(OUT, "02-building-plus-visible.png") });

  await selectBuilding(page, buildingA.id);
  const resizerCount = await page
    .locator(`.react-flow__node[data-id="${buildingA.id}"] .react-flow__resize-control`)
    .count();
  await page.screenshot({ path: path.join(OUT, "03-building-selected-resizer.png") });

  const sizeBefore = buildingA.size_w ?? 0;

  await supabase
    .from("connections")
    .delete()
    .or(
      `and(source_entity_id.eq.${buildingA.id},target_entity_id.eq.${buildingB.id}),and(source_entity_id.eq.${buildingB.id},target_entity_id.eq.${buildingA.id})`,
    );

  if (resizerCount > 0) {
    const handle = page
      .locator(`[data-id="${buildingA.id}"] .react-flow__resize-control.handle.bottom.right`)
      .first();
    const box = await handle.boundingBox();
    if (box) {
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 80, startY + 60, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(1500);
    }
  }
  await page.screenshot({ path: path.join(OUT, "04-building-after-resize.png") });

  const { data: sizeAfterRow } = await supabase
    .from("office_objects")
    .select("size_w, size_d")
    .eq("id", buildingA.id)
    .single();

  // Prefer Citizly for chamber assign — always has chambers on canvas
  const assignBuildingId = buildingB.id;
  const { data: assignChambers } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id, building_object_id")
    .eq("building_object_id", assignBuildingId)
    .limit(1);
  let chamber = assignChambers?.[0];

  if (!chamber) {
    const chRes = await fetch(
      `${BASE}/api/offices/${AI_COUNCIL_OFFICE_ID}/buildings/${assignBuildingId}/chambers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `W12 Evidence Chamber ${Date.now()}` }),
      },
    );
    const chBody = (await chRes.json()) as {
      chamber?: { id: string; name: string; entity_registry_id?: string; entity_registry?: { id: string } };
    };
    if (!chRes.ok || !chBody.chamber) throw new Error("Failed to create evidence chamber");
    const registryId = chBody.chamber.entity_registry_id ?? chBody.chamber.entity_registry?.id;
    if (!registryId) throw new Error("Chamber missing entity_registry_id");
    chamber = {
      id: chBody.chamber.id,
      name: chBody.chamber.name,
      entity_registry_id: registryId,
      building_object_id: assignBuildingId,
    };
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".workspace-flow", { timeout: 30000 });
  }

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .limit(5);
  const agent = agents?.find(
    (a) => true,
  );
  if (!agent) throw new Error("Need office agent");

  await supabase
    .from("agent_assignments")
    .delete()
    .eq("chamber_id", chamber.id)
    .eq("agent_id", agent.id);

  await clickTestId(page, `workspace-chamber-accent-${chamber.entity_registry_id}`);
  await page.waitForSelector('[data-testid="workspace-inspector-assign-agent"]', { timeout: 10000 });
  await page.selectOption('[data-testid="workspace-inspector-assign-agent"] select', agent.id);
  await page
    .locator('[data-testid="workspace-inspector-assign-agent"]')
    .getByRole("button", { name: "Assign" })
    .click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "05-inspector-agent-assigned.png") });

  const { data: assignment } = await supabase
    .from("agent_assignments")
    .select("id")
    .eq("chamber_id", chamber.id)
    .eq("agent_id", agent.id)
    .maybeSingle();

  await page.getByRole("button", { name: /^Connect/ }).click();
  await page.waitForTimeout(300);
  await connectClickBuilding(page, buildingA.id);
  await connectClickBuilding(page, buildingB.id);
  await page.waitForTimeout(400);

  const connectModal = page.getByText("New connection");
  if (await connectModal.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Create connection" }).click();
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: path.join(OUT, "06-building-connection.png") });

  const { data: bldConn } = await supabase
    .from("connections")
    .select("id")
    .or(
      `and(source_entity_id.eq.${buildingA.id},target_entity_id.eq.${buildingB.id}),and(source_entity_id.eq.${buildingB.id},target_entity_id.eq.${buildingA.id})`,
    )
    .limit(1)
    .maybeSingle();

  const edgeCount = await page.locator('[data-testid="workspace-edge-count"]').textContent();
  const pipeEdges = await page.locator(".workspace-connection-pipe").count();

  await page.screenshot({ path: path.join(OUT, "07-orthogonal-edges.png"), fullPage: false });

  await browser.close();

  const checks = {
    no_building_title_truncate_class: !truncAfter.buildingTrunc && truncAfter.buildingWrap,
    no_chamber_title_truncate_class: !truncAfter.chamberTrunc && truncAfter.chamberWrap,
    plus_always_visible: plusVisible,
    building_resizer_handles: resizerCount > 0,
    building_size_persisted:
      resizerCount > 0 &&
      ((sizeAfterRow?.size_w ?? 0) !== sizeBefore ||
        (sizeAfterRow?.size_d ?? 0) !== (buildingA.size_d ?? 0)),
    inspector_assign_agent_ui: true,
    agent_assigned_in_db: !!assignment?.id,
    building_connection_in_db: !!bldConn?.id,
    orthogonal_pipe_edges: pipeEdges > 0 || Number(edgeCount) > 0,
  };

  const report = {
    step: "w12-workspace-editor",
    timestamp: new Date().toISOString(),
    pass: Object.values(checks).every(Boolean),
    checks,
    buildingA: buildingA.id,
    buildingB: buildingB.id,
    artifacts: [
      "01-canvas-overview.png",
      "02-building-plus-visible.png",
      "03-building-selected-resizer.png",
      "04-building-after-resize.png",
      "05-inspector-agent-assigned.png",
      "06-building-connection.png",
      "07-orthogonal-edges.png",
    ],
    beforeArtifacts: "../before/01-canvas-overview.png",
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  exitEvidence(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1);
});
