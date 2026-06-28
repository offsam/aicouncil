/**
 * W3 evidence v2 — target chambers by DB id (data-testid on nodes).
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const OFFICE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w3");

type ChamberRow = {
  id: string;
  name: string;
  entity_registry_id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
};

async function sqlChambers(supabase: ReturnType<typeof createClient>, buildingId: string) {
  const { data } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id, x, z, width, depth")
    .eq("building_object_id", buildingId)
    .order("name");
  return (data ?? []) as ChamberRow[];
}

async function cleanup(supabase: ReturnType<typeof createClient>) {
  const { data: rooms } = await supabase
    .from("office_objects")
    .select("id, label")
    .eq("office_id", OFFICE_ID)
    .eq("object_type", "room");
  for (const r of rooms ?? []) {
    const label = r.label ?? "";
    if (!label.startsWith("Citizly") && !label.startsWith("Здание")) continue;
    const { data: chs } = await supabase
      .from("chambers")
      .select("id")
      .eq("building_object_id", r.id);
    for (const c of chs ?? []) {
      await fetch(`${BASE}/api/offices/${OFFICE_ID}/buildings/${r.id}/chambers/${c.id}`, {
        method: "DELETE",
      });
    }
    await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects/${r.id}`, { method: "DELETE" });
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await cleanup(supabase);

  const bRes = await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "room",
      label: "Citizly",
      routing_description:
        "Citizly product workspace for content, marketing, product fixes, and project coordination.",
      position_x: 24,
      position_z: 12,
      size_w: 10,
      size_d: 8,
    }),
  });
  const bData = (await bRes.json()) as { object?: { id: string } };
  const buildingId = bData.object!.id;

  const seeded: ChamberRow[] = [];
  for (const [i, name] of ["Instagram", "PDF Processing", "Marketing"].entries()) {
    const res = await fetch(
      `${BASE}/api/offices/${OFFICE_ID}/buildings/${buildingId}/chambers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          x: -3 + (i % 2) * 6,
          z: -2 + Math.floor(i / 2) * 3,
          width: 2.5,
          depth: 2,
        }),
      },
    );
    const d = (await res.json()) as { chamber?: ChamberRow & { entity_registry_id: string } };
    seeded.push({
      id: d.chamber!.id,
      entity_registry_id: d.chamber!.entity_registry_id,
      name,
      x: d.chamber!.x,
      z: d.chamber!.z,
      width: d.chamber!.width,
      depth: d.chamber!.depth,
    });
  }

  const ig = seeded.find((c) => c.name === "Instagram")!;
  const mkt = seeded.find((c) => c.name === "Marketing")!;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const log: string[] = [];
  const note = (s: string) => {
    log.push(s);
    console.log(s);
  };

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.getByTestId(`rf__node-${buildingId}`).click({ force: true });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, "01-initial-load.png") });
  note("01 screenshot: Citizly + 3 nested chambers");

  const sqlBefore = await sqlChambers(supabase, buildingId);

  // CREATE — select building header, add chamber
  await page.getByTestId(`rf__node-${buildingId}`).click({ force: true, position: { x: 24, y: 14 } });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "+ Chamber" }).click({ force: true });
  await page.waitForTimeout(900);
  note("CREATE: + Chamber (4th inside Citizly)");

  let rows = await sqlChambers(supabase, buildingId);
  const support = rows.find((c) => c.name.startsWith("Chamber"))!;
  const supportNode = page.getByTestId(`rf__node-${support.entity_registry_id}`);

  // RENAME Support
  await supportNode.dblclick({ force: true });
  const sIn = supportNode.locator("input");
  await sIn.fill("Support");
  await sIn.press("Enter");
  await page.waitForTimeout(500);
  note("RENAME: Chamber N → Support");

  // RENAME Marketing
  const mktNode = page.getByTestId(`rf__node-${mkt.entity_registry_id}`);
  await mktNode.dblclick({ force: true });
  const mIn = mktNode.locator("input");
  await mIn.fill("Marketing Ops");
  await mIn.press("Enter");
  await page.waitForTimeout(500);
  note("RENAME: Marketing → Marketing Ops");

  // MOVE Instagram
  const igNode = page.getByTestId(`rf__node-${ig.entity_registry_id}`);
  const box = await igNode.boundingBox();
  if (!box) throw new Error("no ig box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 30, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForTimeout(900);
  note("MOVE: Instagram dragged inside Citizly");

  // RESIZE Instagram
  await igNode.click({ force: true });
  await page.waitForTimeout(200);
  const handle = page.locator(".react-flow__resize-control.handle.bottom.right").first();
  const hb = await handle.boundingBox();
  if (hb) {
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 40, hb.y + 28, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    note("RESIZE: Instagram via handles");
  }

  await page.screenshot({ path: path.join(OUT, "02-after-ops.png") });
  const sqlAfterOps = await sqlChambers(supabase, buildingId);
  const igAfterOps = sqlAfterOps.find((c) => c.id === ig.id)!;

  // DELETE Support
  rows = await sqlChambers(supabase, buildingId);
  const supportRow = rows.find((c) => c.name === "Support")!;
  const supportDel = page.getByTestId(`rf__node-${supportRow.entity_registry_id}`);
  await supportDel.click({ force: true });
  await supportDel.getByRole("button", { name: "×" }).click();
  await page.waitForTimeout(700);
  note("DELETE: Support");

  await page.screenshot({ path: path.join(OUT, "03-after-delete.png") });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId(`rf__node-${buildingId}`).click({ force: true });
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "04-after-refresh.png") });
  note("04 screenshot: after refresh");

  const sqlAfterRefresh = await sqlChambers(supabase, buildingId);
  const igAfterRefresh = sqlAfterRefresh.find((c) => c.id === ig.id)!;
  const igBefore = sqlBefore.find((c) => c.id === ig.id)!;

  const report = {
    buildingId,
    operations: log,
    sqlBefore,
    sqlAfterOps,
    sqlAfterRefresh,
    instagram: { before: igBefore, afterOps: igAfterOps, afterRefresh: igAfterRefresh },
    checks: {
      create_and_delete_support:
        sqlAfterOps.some((c) => c.name === "Support") &&
        !sqlAfterRefresh.some((c) => c.name === "Support"),
      rename_marketing: sqlAfterRefresh.some((c) => c.name === "Marketing Ops"),
      move_instagram:
        Math.abs(Number(igAfterRefresh.x) - Number(igBefore.x)) > 0.05 ||
        Math.abs(Number(igAfterRefresh.z) - Number(igBefore.z)) > 0.05,
      resize_instagram:
        Math.abs(Number(igAfterRefresh.width) - Number(igBefore.width)) > 0.05 ||
        Math.abs(Number(igAfterRefresh.depth) - Number(igBefore.depth)) > 0.05,
      coords_stable_after_refresh:
        JSON.stringify(igAfterOps) === JSON.stringify(igAfterRefresh),
      chamber_count_3: sqlAfterRefresh.length === 3,
    },
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();

  console.log("\n=== CHECKS ===", report.checks);
  console.log("\nInstagram coords:", igBefore, "→", igAfterRefresh);
  if (!Object.values(report.checks).every(Boolean)) exitEvidence(1);
}

main().catch((e) => {
  console.error(e);
  exitEvidence(1);
});
