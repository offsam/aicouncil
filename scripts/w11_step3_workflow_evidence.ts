/**
 * W11 Step 3 — Mission Control workflow → Workspace canvas bridge (cross-tab)
 *
 * Creates a real multi-step workflow in DB (no Groq planner), then launches MC with
 * intercepted POST so the UI path matches production bridge wiring.
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import { createWorkflowAndExecute } from "../lib/workflow-orchestrator";
import { WORKSPACE_PENDING_WORKFLOW_KEY } from "../lib/mission-workspace-bridge";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w11-step3-workflow");

async function setupRealWorkflow(taskMarker: string) {
  const supabase = getSupabaseAdmin();
  const { data: chambers } = await supabase
    .from("entity_registry")
    .select("id, name")
    .eq("entity_type", "chamber")
    .order("name")
    .limit(2);

  if (!chambers || chambers.length < 2) {
    throw new Error("Need at least 2 chambers for workflow evidence");
  }

  const taskText = `W11 step3 workflow bridge ${taskMarker}: сначала ${chambers[0]!.name}, потом ${chambers[1]!.name}`;
  const workflowId = await createWorkflowAndExecute(taskText, {
    needsWorkflow: true,
    steps: [
      { targetChamberEntityId: chambers[0]!.id, reason: `Step 1 — ${chambers[0]!.name}` },
      { targetChamberEntityId: chambers[1]!.id, reason: `Step 2 — ${chambers[1]!.name}` },
    ],
  });

  const { data: workflow } = await supabase.from("workflows").select("*").eq("id", workflowId).single();
  const { data: steps } = await supabase
    .from("workflow_steps")
    .select(
      "*, target_chamber:entity_registry!target_chamber_entity_id(id, name, entity_type), assigned_agent:agents(id, name)",
    )
    .eq("workflow_id", workflowId)
    .order("step_order", { ascending: true });

  return { taskText, workflowId, workflow, steps: steps ?? [] };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const taskMarker = `w11s3-${Date.now()}`;
  const setup = await setupRealWorkflow(taskMarker);
  console.log("Real workflow ready:", setup.workflowId, setup.workflow?.status);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });

  const workspacePage = await context.newPage();
  await workspacePage.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await workspacePage.waitForSelector(".workspace-flow", { timeout: 30000 });
  await workspacePage.evaluate(() => {
    (window as unknown as { __w11WorkflowLoads?: number }).__w11WorkflowLoads = 1;
  });

  const missionPage = await context.newPage();
  await missionPage.route((url) => url.pathname === "/api/workflows", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "workflow",
          workflowId: setup.workflowId,
          workflow: setup.workflow,
          steps: setup.steps,
        }),
      });
      return;
    }
    await route.continue();
  });

  await missionPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await missionPage.locator("textarea").first().fill(setup.taskText);
  await missionPage.getByRole("button", { name: /Launch analysis/i }).click();

  await missionPage.waitForFunction(
    (marker) => document.body.textContent?.includes(marker) ?? false,
    taskMarker,
    { timeout: 120000 },
  );
  await missionPage.screenshot({
    path: path.join(OUT, "01-mission-workflow-panel.png"),
    fullPage: false,
  });

  await workspacePage.waitForFunction(
    () =>
      document.querySelectorAll(".workspace-route-node").length >= 2 ||
      document.querySelector('[data-testid="workspace-workflow-step-badge"]') !== null,
    { timeout: 120000 },
  );
  await workspacePage.waitForTimeout(800);
  await workspacePage.screenshot({
    path: path.join(OUT, "02-workspace-workflow-highlight.png"),
    fullPage: false,
  });

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
    WORKSPACE_PENDING_WORKFLOW_KEY,
    { timeout: 120000 },
  );

  await workspacePage.waitForTimeout(2500);
  await workspacePage.screenshot({
    path: path.join(OUT, "03-workspace-workflow-replay.png"),
    fullPage: false,
  });
  await missionPage.screenshot({
    path: path.join(OUT, "04-mission-workflow-complete.png"),
    fullPage: false,
  });

  const loadCountAfter = await workspacePage.evaluate(
    () => (window as unknown as { __w11WorkflowLoads?: number }).__w11WorkflowLoads ?? 0,
  );
  const routeNodes = await workspacePage.locator(".workspace-route-node").count();
  const workflowBadge = await workspacePage
    .locator('[data-testid="workspace-workflow-step-badge"]')
    .count();
  const pendingMission = await missionPage.evaluate(
    (key) => localStorage.getItem(key),
    WORKSPACE_PENDING_WORKFLOW_KEY,
  );
  const pendingWorkspace = await workspacePage.evaluate(
    (key) => localStorage.getItem(key),
    WORKSPACE_PENDING_WORKFLOW_KEY,
  );
  const bridgeWasConsumed = pendingMission === null && pendingWorkspace === null;
  const hasWorkflowLinks = await missionPage
    .getByRole("link", { name: /Маршрут в Workspace/i })
    .count();

  await browser.close();

  const checks = {
    real_workflow_in_db: setup.steps.length >= 2,
    mission_workflow_panel: true,
    workspace_highlight_or_badge: routeNodes >= 2 || workflowBadge >= 1,
    workspace_no_reload: loadCountAfter === 1,
    bridge_consumed_cross_tab: bridgeWasConsumed,
    workflow_nav_links: hasWorkflowLinks >= 1,
  };

  const report = {
    step: "w11-step3-workflow",
    timestamp: new Date().toISOString(),
    pass: Object.values(checks).every(Boolean),
    checks,
    workflowId: setup.workflowId,
    note: "Real workflow via createWorkflowAndExecute; MC POST intercepted (Groq TPD exhausted for planner)",
    metrics: { routeNodes, workflowBadge, loadCountAfter },
    artifacts: [
      "01-mission-workflow-panel.png",
      "02-workspace-workflow-highlight.png",
      "03-workspace-workflow-replay.png",
      "04-mission-workflow-complete.png",
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
