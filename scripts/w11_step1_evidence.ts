/**
 * W11 Step 1 — Mission Control → Workspace pending route bridge
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { ROUTING_SOURCE_ENTITY_KEY } from "../lib/routing-source-storage";
import { WORKSPACE_PENDING_ROUTE_KEY } from "../lib/mission-workspace-bridge";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w11-step1");
const INSTAGRAM = "39d9aa14-6eb3-4359-bd21-ee9a148d62b8";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  await page.evaluate(
    ({ key, entityId }) => {
      sessionStorage.setItem(key, entityId);
    },
    { key: ROUTING_SOURCE_ENTITY_KEY, entityId: INSTAGRAM },
  );

  const taskText = `W11 step1 Instagram mission bridge ${Date.now()}`;
  await page.locator("textarea").first().fill(taskText);
  await page.getByRole("button", { name: /Launch analysis/i }).click();

  await page.waitForFunction(
    (key) => localStorage.getItem(key) !== null,
    WORKSPACE_PENDING_ROUTE_KEY,
    { timeout: 300000 },
  );

  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "01-mission-launch.png"), fullPage: false });

  const pendingBeforeNav = await page.evaluate(
    (key) => localStorage.getItem(key),
    WORKSPACE_PENDING_ROUTE_KEY,
  );
  const pendingParsed = pendingBeforeNav ? JSON.parse(pendingBeforeNav) : null;

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });

  await page.waitForFunction(
    () => document.querySelectorAll(".workspace-route-node").length >= 2,
    { timeout: 60000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "02-workspace-highlight.png"), fullPage: false });

  const routeNodes = await page.locator(".workspace-route-node").count();
  const highlightedNodes = await page.locator(".workspace-node-route-highlight").count();
  const pendingAfter = await page.evaluate(
    (key) => localStorage.getItem(key),
    WORKSPACE_PENDING_ROUTE_KEY,
  );

  await browser.close();

  const checks = {
    mission_completed: Boolean(pendingParsed),
    pending_written: pendingParsed?.source === "mission-control",
    pending_target_instagram:
      pendingParsed?.routing?.targetEntityRegistryId === INSTAGRAM,
    pending_agents_count: (pendingParsed?.agents?.length ?? 0) >= 1,
    workspace_route_nodes: routeNodes >= 2,
    workspace_highlighted_nodes: highlightedNodes >= 2,
    pending_consumed: pendingAfter === null,
  };

  const report = {
    step: "w11-step1",
    timestamp: new Date().toISOString(),
    pass: Object.values(checks).every(Boolean),
    checks,
    pendingPreview: pendingParsed
      ? {
          target: pendingParsed.routing?.targetEntityRegistryId,
          agents: pendingParsed.agents?.map((a: { slug: string; status: string }) => ({
            slug: a.slug,
            status: a.status,
          })),
        }
      : null,
    artifacts: ["01-mission-launch.png", "02-workspace-highlight.png"],
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  exitEvidence(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1);
});
