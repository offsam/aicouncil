/**
 * W17 — Separate cable exit slots + draggable orthogonal routes persisted after reload.
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
const OUT = path.join(process.cwd(), "docs/evidence/w17-cable-routing");

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
    .limit(6);

  const nonCityHall = (buildings ?? []).filter(
    (b) => !String(b.label ?? "").toLowerCase().includes("city hall"),
  );
  const buildingA = nonCityHall[0] ?? buildings?.[0];
  const buildingB = nonCityHall[1] ?? buildings?.[1];
  if (!buildingA || !buildingB || buildingA.id === buildingB.id) {
    throw new Error("Need two distinct buildings");
  }

  let targetCId = nonCityHall[2]?.id ?? null;
  if (!targetCId) {
    const { data: chamber } = await supabase
      .from("chambers")
      .select("entity_registry_id, name, building_object_id")
      .neq("building_object_id", buildingA.id)
      .limit(1)
      .maybeSingle();
    if (!chamber?.entity_registry_id) throw new Error("Need a third connection target (building or chamber)");
    targetCId = chamber.entity_registry_id;
  }
  const ids = [buildingA.id, buildingB.id, targetCId];
  await supabase
    .from("connections")
    .delete()
    .or(
      ids
        .flatMap((a) =>
          ids
            .filter((b) => b !== a)
            .map((b) => `and(source_entity_id.eq.${a},target_entity_id.eq.${b})`),
        )
        .join(","),
    );

  async function createConn(source: string, target: string) {
    const res = await fetch(`${BASE}/api/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_entity_id: source,
        target_entity_id: target,
        read_knowledge: true,
      }),
    });
    const body = (await res.json()) as { connection?: { id: string }; error?: string };
    if (!res.ok || !body.connection) throw new Error(body.error ?? "create connection failed");
    return body.connection.id;
  }

  const connAB = await createConn(buildingA.id, buildingB.id);
  const connAC = await createConn(buildingA.id, targetCId);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 60000 });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(800);

  const nodeA = page.locator(`.react-flow__node[data-id="${buildingA.id}"]`);
  await nodeA.waitFor({ timeout: 20000 });

  const sourceHandles = nodeA.locator('[data-testid^="workspace-handle-source-"]');
  await sourceHandles.first().waitFor({ timeout: 10000 });
  const handleCount = await sourceHandles.count();
  if (handleCount < 2) throw new Error(`Expected 2+ source handles on building, got ${handleCount}`);

  const boxes: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < handleCount; i += 1) {
    const box = await sourceHandles.nth(i).boundingBox();
    if (box) boxes.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }

  const separateExitSlots = boxes.some((a, i) =>
    boxes.some((b, j) => i < j && (Math.abs(a.x - b.x) >= 8 || Math.abs(a.y - b.y) >= 8)),
  );
  const exitSlotDeltaY = boxes.length >= 2 ? Math.abs(boxes[0].y - boxes[1].y) : 0;

  await page.screenshot({ path: path.join(OUT, "01-two-cables-separate-exits.png"), fullPage: true });

  await page.locator(`#connection-${connAB}`).hover({ force: true }).catch(() => {});
  await page.locator(`#connection-${connAB}`).click({ force: true });
  await page.waitForTimeout(500);

  let segHandle = page.locator(`[data-testid="workspace-edge-segment-handle-${connAB}-1"]`);
  if ((await segHandle.count()) === 0) {
    segHandle = page.locator(`[data-testid^="workspace-edge-segment-handle-${connAB}-"]`).first();
  }
  await segHandle.waitFor({ timeout: 10000 });
  const segBox = await segHandle.boundingBox();
  if (!segBox) throw new Error("Segment handle not found");

  const sx = segBox.x + segBox.width / 2;
  const sy = segBox.y + segBox.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 120, sy + 90, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(OUT, "02-cable-dragged.png"), fullPage: true });

  const { data: afterDrag } = await supabase
    .from("connections")
    .select("route_path")
    .eq("id", connAB)
    .single();

  const routeSaved =
    afterDrag?.route_path != null &&
    Array.isArray((afterDrag.route_path as { points?: unknown[] }).points) &&
    ((afterDrag.route_path as { points: unknown[] }).points?.length ?? 0) > 0;

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 60000 });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "03-after-f5-reload.png"), fullPage: true });

  const { data: afterReload } = await supabase
    .from("connections")
    .select("route_path")
    .eq("id", connAB)
    .single();

  const routePersisted =
    JSON.stringify(afterReload?.route_path ?? null) === JSON.stringify(afterDrag?.route_path ?? null);

  const report = {
    buildingA: buildingA.label,
    buildingB: buildingB.label,
    buildingC: targetCId,
    connectionAB: connAB,
    connectionAC: connAC,
    exitSlotDeltaY,
    separateExitSlots,
    routeSaved,
    routePersisted,
    routePathAfterDrag: afterDrag?.route_path ?? null,
    routePathAfterReload: afterReload?.route_path ?? null,
    screenshots: [
      "docs/evidence/w17-cable-routing/01-two-cables-separate-exits.png",
      "docs/evidence/w17-cable-routing/02-cable-dragged.png",
      "docs/evidence/w17-cable-routing/03-after-f5-reload.png",
    ],
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();

  console.log(JSON.stringify(report, null, 2));
  const ok = separateExitSlots && routeSaved && routePersisted;
  exitEvidence(ok ? 0 : 1, ok ? "w17 cable routing OK" : "w17 cable routing FAILED");
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1, String(err));
});
