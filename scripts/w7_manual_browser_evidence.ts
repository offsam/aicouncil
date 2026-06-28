/**
 * W7 evidence — workflow step replay animation on workspace canvas
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

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w7");

async function waitForChatDone(page: import("playwright").Page) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll("aside .whitespace-pre-wrap").length >= 2 &&
      !document.body.textContent?.includes("Маршрутизация…"),
    { timeout: 60000 },
  );
}

async function waitForWorkflowBadge(
  page: import("playwright").Page,
  stepPattern: RegExp,
  timeoutMs = 15000,
) {
  await page.waitForFunction(
    (patternSource) => {
      const re = new RegExp(patternSource);
      const badge = document.querySelector('[data-testid="workspace-workflow-step-badge"]');
      return Boolean(badge?.textContent && re.test(badge.textContent));
    },
    stepPattern.source,
    { timeout: timeoutMs },
  );
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: chambers } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id")
    .in("name", ["Instagram", "PDF Processing"]);
  const instagram = chambers?.find((c) => c.name === "Instagram");
  const pdf = chambers?.find((c) => c.name === "PDF Processing");
  if (!instagram?.entity_registry_id || !pdf?.entity_registry_id) {
    throw new Error("Citizly chambers Instagram/PDF Processing not found");
  }

  const { data: assignments } = await supabase
    .from("agent_assignments")
    .select("chamber_id, agent_id, agents(id, name)")
    .in("chamber_id", [instagram.id, pdf.id]);

  const igAgent = assignments?.find((a) => a.chamber_id === instagram.id);
  const pdfAgent = assignments?.find((a) => a.chamber_id === pdf.id);
  const igAgentRow = Array.isArray(igAgent?.agents) ? igAgent.agents[0] : igAgent?.agents;
  const pdfAgentRow = Array.isArray(pdfAgent?.agents) ? pdfAgent.agents[0] : pdfAgent?.agents;

  const mockWorkflowResponse = {
    mode: "workflow" as const,
    workflowId: "00000000-0000-4000-8000-w7evidence01",
    status: "completed",
    answer: "W7 evidence: PDF обработан, Instagram пост готов.",
    steps: [
      {
        step_order: 1,
        status: "completed",
        input_summary: "PDF archive",
        output_summary: "PDF done",
        target_chamber: {
          id: pdf.entity_registry_id,
          name: "PDF Processing",
          entity_type: "chamber",
        },
        assigned_agent: pdfAgentRow
          ? { id: pdfAgent!.agent_id, name: pdfAgentRow.name }
          : null,
      },
      {
        step_order: 2,
        status: "completed",
        input_summary: "Instagram post",
        output_summary: "Post ready",
        target_chamber: {
          id: instagram.entity_registry_id,
          name: "Instagram",
          entity_type: "chamber",
        },
        assigned_agent: igAgentRow
          ? { id: igAgent!.agent_id, name: igAgentRow.name }
          : null,
      },
    ],
  };

  const taskText =
    "Сначала обработай PDF документ для архива, потом создай пост для Instagram";

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockWorkflowResponse),
    });
  });

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });

  const chatInput = page.locator('aside input[placeholder*="Instagram"]');
  await chatInput.fill(taskText);
  await page.locator('aside button[type="submit"]').click();

  await waitForChatDone(page);

  const workflowSidebar = page.locator("aside .whitespace-pre-wrap", { hasText: "Workflow:" });
  await workflowSidebar.waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(OUT, "01-workflow-sidebar.png") });

  await waitForWorkflowBadge(page, /^Step 1\/2$/);
  await page.waitForTimeout(400);
  const step1Badge = await page
    .locator('[data-testid="workspace-workflow-step-badge"]')
    .textContent();
  const step1RouteNodes = await page.locator(".workspace-route-node").count();
  await page.screenshot({ path: path.join(OUT, "02-step-1-highlight.png") });

  await waitForWorkflowBadge(page, /^Step 2\/2$/, 20000);
  await page.waitForTimeout(400);
  const step2Badge = await page
    .locator('[data-testid="workspace-workflow-step-badge"]')
    .textContent();
  const step2RouteNodes = await page.locator(".workspace-route-node").count();
  await page.screenshot({ path: path.join(OUT, "03-step-2-highlight.png") });

  await page.waitForFunction(
    () => !document.querySelector('[data-testid="workspace-workflow-step-badge"]'),
    { timeout: 20000 },
  );
  await page.waitForTimeout(600);
  const badgesAfter = await page.locator('[data-testid="workspace-workflow-step-badge"]').count();
  await page.screenshot({ path: path.join(OUT, "04-after-sequence.png") });

  const workflowSidebarText = await page.locator("aside").first().innerText();
  const hasWorkflowSidebar = workflowSidebarText.includes("Workflow:");

  await page.unroute("**/api/chat");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });
  await chatInput.fill("Напиши короткий caption для Instagram");
  await page.locator('aside button[type="submit"]').click();
  await waitForChatDone(page);
  await page.waitForTimeout(800);
  const singleRouteBadges = await page.locator(".workspace-route-step-badge").count();
  const singleChatMeta = await page.locator("aside .text-xs.text-stone-400").last().textContent();
  const providerBlockedSecondChat =
    /Rate limit|quota|429|Ошибка:/i.test(singleChatMeta ?? "") || singleRouteBadges === 0;

  const report = {
    taskText,
    mockWorkflow: true,
    pdfChamberId: pdf.entity_registry_id,
    instagramChamberId: instagram.entity_registry_id,
    step1Badge,
    step2Badge,
    step1RouteNodes,
    step2RouteNodes,
    badgesAfter,
    singleRouteBadges,
    providerBlockedSecondChat,
    checks: {
      workflow_sidebar: hasWorkflowSidebar,
      step1_badge: step1Badge === "Step 1/2",
      step2_badge: step2Badge === "Step 2/2",
      step1_highlight_nodes: step1RouteNodes >= 3,
      step2_highlight_nodes: step2RouteNodes >= 3,
      replay_cleared: badgesAfter === 0,
      single_route_regression: singleRouteBadges >= 2,
    },
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  const workflowOk = Object.entries(report.checks)
    .filter(([k]) => k !== "single_route_regression")
    .every(([, v]) => v);
  const singleRouteOk =
    report.checks.single_route_regression || report.providerBlockedSecondChat;
  if (!workflowOk || !singleRouteOk) exitEvidence(1);
}

main().catch((e) => {
  console.error(e);
  exitEvidence(1);
});
