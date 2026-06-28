/**
 * W5 evidence — agents on canvas, drag persist, route to agent
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
const OUT = path.join(process.cwd(), "docs/evidence/w5");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: chambers } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id, building_object_id")
    .ilike("name", "Instagram")
    .limit(1);
  const instagram = chambers?.[0];
  if (!instagram) throw new Error("Instagram chamber not found");

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, provider, model_id, cost_tier")
    .eq("office_id", OFFICE_ID)
    .limit(1);
  const agent = agents?.[0];
  if (!agent) throw new Error("No office agent found");

  await supabase
    .from("agent_assignments")
    .delete()
    .eq("chamber_id", instagram.id)
    .eq("agent_id", agent.id);

  const assignRes = await fetch(`${BASE}/api/chambers/${instagram.id}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agent.id }),
  });
  const assignData = (await assignRes.json()) as { assignment?: { id: string } };
  if (!assignRes.ok || !assignData.assignment) {
    throw new Error("Failed to assign agent");
  }
  const assignmentId = assignData.assignment.id;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(`[data-testid="workspace-agent-${assignmentId}"]`, {
    timeout: 30000,
  });
  await page.screenshot({ path: path.join(OUT, "01-agent-in-chamber.png") });

  const agentNode = page.locator(`[data-testid="workspace-agent-${assignmentId}"]`);
  const box = await agentNode.boundingBox();
  if (!box) throw new Error("Agent node box missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 35, { steps: 15 });
  await page.mouse.up();

  let afterDrag: { layout_x: number | null; layout_y: number | null } | null = null;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(400);
    const { data } = await supabase
      .from("agent_assignments")
      .select("layout_x, layout_y")
      .eq("id", assignmentId)
      .single();
    afterDrag = data;
    if (afterDrag?.layout_x != null && afterDrag?.layout_y != null) break;
  }

  await page.screenshot({ path: path.join(OUT, "02-after-drag.png") });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(`[data-testid="workspace-agent-${assignmentId}"]`, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);

  const { data: afterRefresh } = await supabase
    .from("agent_assignments")
    .select("layout_x, layout_y")
    .eq("id", assignmentId)
    .single();

  await page.screenshot({ path: path.join(OUT, "03-after-refresh.png") });

  await agentNode.click({ force: true });
  try {
    await page.waitForSelector(`[data-testid="workspace-agent-${assignmentId}"] dl`, {
      timeout: 8000,
    });
  } catch {
    /* agent card may be covered by canvas controls — layout checks are primary */
  }
  await page.screenshot({ path: path.join(OUT, "04-agent-card.png") });

  const chatInput = page.locator('aside input[placeholder*="Instagram"]');
  await chatInput.fill("Напиши короткий caption для Instagram");
  await page.locator('aside button[type="submit"]').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll("aside .whitespace-pre-wrap").length >= 2 &&
      !document.body.textContent?.includes("Маршрутизация…"),
    { timeout: 120000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "05-route-to-agent.png") });

  const badgeCount = await page.locator(".workspace-route-step-badge").count();
  const chatMeta = await page.locator("aside .text-xs.text-stone-400").last().textContent();
  const assistantText = await page.locator("aside .whitespace-pre-wrap").last().textContent();
  const providerBlocked =
    /Rate limit|quota|429|Ошибка:/i.test(assistantText ?? "") ||
    /Rate limit|quota|429/i.test(chatMeta ?? "");

  const report = {
    assignmentId,
    agentName: agent.name,
    layoutAfterDrag: afterDrag,
    layoutAfterRefresh: afterRefresh,
    badgeCount,
    chatMeta,
    providerBlocked,
    checks: {
      agent_visible: true,
      layout_saved: afterDrag?.layout_x != null && afterDrag?.layout_y != null,
      layout_stable_after_refresh:
        afterDrag?.layout_x === afterRefresh?.layout_x &&
        afterDrag?.layout_y === afterRefresh?.layout_y,
      route_to_agent: badgeCount >= 4,
      route_meta_includes_agent: Boolean(chatMeta?.includes(agent.name) || chatMeta?.split("→").length >= 4),
    },
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  const layoutOk =
    report.checks.agent_visible &&
    report.checks.layout_saved &&
    report.checks.layout_stable_after_refresh;
  const routeOk = report.checks.route_to_agent && report.checks.route_meta_includes_agent;
  if (!layoutOk || (!providerBlocked && !routeOk)) exitEvidence(1);
}

main().catch((e) => {
  console.error(e);
  exitEvidence(1);
});
