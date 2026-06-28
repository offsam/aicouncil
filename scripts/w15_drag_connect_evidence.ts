/**
 * W15 — Connect via «+» → «Соединить» → click target, save to DB.
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
const OUT = path.join(process.cwd(), "docs/evidence/w15-drag-connect");

async function connectViaAddMenu(
  page: import("playwright").Page,
  sourceBuildingId: string,
  targetBuildingId: string,
) {
  const sourceNode = page.locator(`.react-flow__node[data-id="${sourceBuildingId}"]`);
  await sourceNode.scrollIntoViewIfNeeded();
  await sourceNode.click();
  await page.waitForTimeout(300);

  const addBtn = page.locator(`[data-testid="workspace-building-add-chamber-${sourceBuildingId}"]`);
  await addBtn.waitFor({ state: "visible", timeout: 8000 });
  await addBtn.click();

  await page.waitForSelector('[data-testid="workspace-add-menu-connect"]', { timeout: 8000 });
  await page.locator('[data-testid="workspace-add-menu-connect"]').click();
  await page.waitForTimeout(400);

  const targetNode = page.locator(`.react-flow__node[data-id="${targetBuildingId}"]`);
  await targetNode.scrollIntoViewIfNeeded();
  await targetNode.click();
  await page.waitForTimeout(400);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: buildings } = await supabase
    .from("office_objects")
    .select("id, label")
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .eq("object_type", "room")
    .order("created_at", { ascending: false })
    .limit(4);

  const nonCityHall = (buildings ?? []).filter(
    (b) => !String(b.label ?? "").toLowerCase().includes("city hall"),
  );
  const buildingA = nonCityHall[0] ?? buildings?.[0];
  const buildingB = nonCityHall[1] ?? buildings?.[1];
  if (!buildingA || !buildingB || buildingA.id === buildingB.id) {
    throw new Error("Need two distinct buildings");
  }

  await supabase
    .from("connections")
    .delete()
    .or(
      `and(source_entity_id.eq.${buildingA.id},target_entity_id.eq.${buildingB.id}),and(source_entity_id.eq.${buildingB.id},target_entity_id.eq.${buildingA.id})`,
    );

  const { count: beforeCount } = await supabase
    .from("connections")
    .select("id", { count: "exact", head: true })
    .or(
      `and(source_entity_id.eq.${buildingA.id},target_entity_id.eq.${buildingB.id}),and(source_entity_id.eq.${buildingB.id},target_entity_id.eq.${buildingA.id})`,
    );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 60000 });
  await page.waitForTimeout(800);

  const edgesBefore = await page.locator('[data-testid="workspace-edge-count"]').textContent();
  await page.screenshot({ path: path.join(OUT, "01-before-connect.png"), fullPage: true });

  await connectViaAddMenu(page, buildingA.id, buildingB.id);

  await page.waitForSelector('[data-testid="workspace-inspector-basic"]', { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, "02-inspector-after-connect.png") });

  await page.locator('[data-testid="workspace-inspector-basic"] button').filter({ hasText: "Сохранить" }).click();
  await page.waitForTimeout(1200);

  await page.screenshot({ path: path.join(OUT, "03-after-connection.png"), fullPage: true });

  const edgesAfter = await page.locator('[data-testid="workspace-edge-count"]').textContent();
  const edgePaths = await page.locator(".workspace-flow .react-flow__edge-path").count();

  const { data: dbRows, count: afterCount } = await supabase
    .from("connections")
    .select("id, source_entity_id, target_entity_id, created_at", { count: "exact" })
    .or(
      `and(source_entity_id.eq.${buildingA.id},target_entity_id.eq.${buildingB.id}),and(source_entity_id.eq.${buildingB.id},target_entity_id.eq.${buildingA.id})`,
    );

  await browser.close();

  const report = {
    buildingA: { id: buildingA.id, label: buildingA.label },
    buildingB: { id: buildingB.id, label: buildingB.label },
    method: "select building → + menu → Connect → click target",
    dbBefore: beforeCount ?? 0,
    dbAfter: afterCount ?? 0,
    dbConnection: dbRows?.[0] ?? null,
    canvasEdgesBefore: Number(edgesBefore ?? 0),
    canvasEdgesAfter: Number(edgesAfter ?? 0),
    visibleEdgePaths: edgePaths,
    success:
      (afterCount ?? 0) > (beforeCount ?? 0) &&
      Number(edgesAfter ?? 0) > Number(edgesBefore ?? 0),
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  if (!report.success) {
    exitEvidence(1, "Menu connect did not persist");
  }
  exitEvidence(0, "W15 menu connect OK");
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1, err instanceof Error ? err.message : String(err));
});
