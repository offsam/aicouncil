/**
 * W11 Step 2 — live Mission Control → Workspace highlight (cross-tab, no reload)
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
const OUT = path.join(process.cwd(), "docs/evidence/w11-step2-live");
const INSTAGRAM = "39d9aa14-6eb3-4359-bd21-ee9a148d62b8";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });

  const workspacePage = await context.newPage();
  await workspacePage.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await workspacePage.waitForSelector(".workspace-flow", { timeout: 30000 });
  await workspacePage.evaluate(() => {
    (window as unknown as { __w11EvidenceLoads?: number }).__w11EvidenceLoads = 1;
  });

  const missionPage = await context.newPage();
  await missionPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await missionPage.evaluate(
    ({ key, entityId }) => {
      sessionStorage.setItem(key, entityId);
    },
    { key: ROUTING_SOURCE_ENTITY_KEY, entityId: INSTAGRAM },
  );

  const taskText = `W11 step2 live bridge ${Date.now()}`;
  await missionPage.locator("textarea").first().fill(taskText);
  await missionPage.getByRole("button", { name: /Launch analysis/i }).click();

  await workspacePage.waitForFunction(
    () => document.querySelectorAll(".workspace-route-node").length >= 2,
    { timeout: 120000 },
  );
  await workspacePage.waitForTimeout(600);
  await workspacePage.screenshot({
    path: path.join(OUT, "01-workspace-live-initial-highlight.png"),
    fullPage: false,
  });

  const initialRouteNodes = await workspacePage.locator(".workspace-route-node").count();
  const loadCountAfter = await workspacePage.evaluate(
    () => (window as unknown as { __w11EvidenceLoads?: number }).__w11EvidenceLoads ?? 0,
  );

  await workspacePage.waitForFunction(
    (prev) => document.querySelectorAll(".workspace-route-node").length >= prev,
    initialRouteNodes,
    { timeout: 180000 },
  );

  await missionPage.waitForFunction(
    (key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return true;
      try {
        return JSON.parse(raw).phase === "complete";
      } catch {
        return false;
      }
    },
    WORKSPACE_PENDING_ROUTE_KEY,
    { timeout: 300000 },
  );

  await workspacePage.waitForTimeout(800);
  await workspacePage.screenshot({
    path: path.join(OUT, "02-workspace-live-after-agents.png"),
    fullPage: false,
  });
  await missionPage.screenshot({
    path: path.join(OUT, "03-mission-control-complete.png"),
    fullPage: false,
  });

  const finalRouteNodes = await workspacePage.locator(".workspace-route-node").count();
  const pendingMission = await missionPage.evaluate(
    (key) => localStorage.getItem(key),
    WORKSPACE_PENDING_ROUTE_KEY,
  );
  const pendingWorkspace = await workspacePage.evaluate(
    (key) => localStorage.getItem(key),
    WORKSPACE_PENDING_ROUTE_KEY,
  );

  await browser.close();

  const checks = {
    workspace_initial_highlight: initialRouteNodes >= 2,
    workspace_still_no_reload: loadCountAfter === 1,
    mission_completed: pendingMission === null,
    workspace_consumed_on_complete: pendingWorkspace === null,
    final_route_nodes: finalRouteNodes >= initialRouteNodes,
  };

  const report = {
    step: "w11-step2-live",
    timestamp: new Date().toISOString(),
    pass: Object.values(checks).every(Boolean),
    checks,
    metrics: {
      initialRouteNodes,
      finalRouteNodes,
    },
    artifacts: [
      "01-workspace-live-initial-highlight.png",
      "02-workspace-live-after-agents.png",
      "03-mission-control-complete.png",
    ],
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  exitEvidence(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1);
});
