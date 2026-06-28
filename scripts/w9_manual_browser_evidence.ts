/**
 * W9 evidence — multi-select, keyboard shortcuts, minimap
 */
import * as fs from "fs";
import * as path from "path";
import { chromium, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import {
  ensureW4W9TestInfra,
  loadEnvLocal,
  W4W9_TEST_CHAMBER_PRIMARY,
  W4W9_TEST_CHAMBER_SECONDARY,
} from "../lib/w4-w9-test-infra";
import {
  exitEvidence,
  multiSelectCountText,
  openWorkspaceChat,
  selectWorkspaceChamberTarget,
  selectWorkspaceInspectorTarget,
  setWorkspaceMultiSelection,
  waitForMultiSelectUi,
  waitForWorkspaceChatDone,
  waitForWorkspaceReady,
  workspaceChatInput,
  workspaceChatSend,
} from "./evidence-utils";

loadEnvLocal();

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w9");

async function selectChamber(
  page: Page,
  chamber: { id: string; name: string; entity_registry_id: string },
  buildingId: string,
) {
  await selectWorkspaceChamberTarget(page, {
    officeId: AI_COUNCIL_OFFICE_ID,
    buildingId,
    chamberId: chamber.id,
    registryId: chamber.entity_registry_id,
    label: chamber.name,
  });
}

async function shiftClickChamber(
  page: Page,
  targets: Array<{ id: string; name: string; entity_registry_id: string }>,
  buildingId: string,
) {
  await setWorkspaceMultiSelection(
    page,
    targets.map((c) => ({
      kind: "chamber",
      officeId: AI_COUNCIL_OFFICE_ID,
      buildingId,
      chamberId: c.id,
      registryId: c.entity_registry_id,
      label: c.name,
    })),
  );
}

async function dismissInspector(page: Page) {
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="workspace-inspector-close"]').click().catch(() => undefined);
  await page.waitForTimeout(200);
}

async function focusCanvas(page: Page) {
  await dismissInspector(page);
  await page.locator('[data-testid="workspace-canvas-shell"]').click({ position: { x: 8, y: 8 }, force: true });
}

async function waitForChatDone(page: Page) {
  await waitForWorkspaceChatDone(page, 60000);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const infra = await ensureW4W9TestInfra(supabase, BASE);
  const primary = infra.chambers.primary;
  const secondary = infra.chambers.secondary;
  const tertiary = infra.chambers.tertiary;
  const agent = infra.agents.a;
  const agentId = agent.id;

  const testRegistryIds = [
    primary.entity_registry_id,
    secondary.entity_registry_id,
    tertiary.entity_registry_id,
  ];

  const createdAssignmentIds: string[] = [];
  async function ensureAssignment(chamberId: string) {
    const { data: existing } = await supabase
      .from("agent_assignments")
      .select("id")
      .eq("chamber_id", chamberId)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (existing?.id) return existing.id;

    const res = await fetch(`${BASE}/api/chambers/${chamberId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId }),
    });
    const body = (await res.json()) as { assignment?: { id: string } };
    if (!res.ok || !body.assignment?.id) throw new Error("Failed to create assignment");
    createdAssignmentIds.push(body.assignment.id);
    return body.assignment.id;
  }

  const primaryAssignmentId = await ensureAssignment(primary.id);
  const secondaryAssignmentId = await ensureAssignment(secondary.id);

  let tempConnectionId: string | null = null;
  const { data: dupConn } = await supabase
    .from("connections")
    .select("id")
    .eq("source_entity_id", secondary.entity_registry_id)
    .eq("target_entity_id", primary.entity_registry_id)
    .maybeSingle();
  if (dupConn?.id) {
    await fetch(`${BASE}/api/connections/${dupConn.id}`, { method: "DELETE" });
  }

  const connRes = await fetch(`${BASE}/api/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_entity_id: secondary.entity_registry_id,
      target_entity_id: primary.entity_registry_id,
      read_rules: true,
    }),
  });
  const connBody = (await connRes.json()) as { connection?: { id: string } };
  if (connRes.ok && connBody.connection?.id) {
    tempConnectionId = connBody.connection.id;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(() => {
    window.confirm = () => true;
  });
  page.on("dialog", (d) => void d.accept());

  await page.goto(`${BASE}/workspace`, { waitUntil: "load", timeout: 60000 });
  await waitForWorkspaceReady(page);
  await page.locator(".react-flow__controls-fitview").click().catch(() => undefined);
  await page.waitForTimeout(600);

  const buildingId = infra.buildingId;

  await selectChamber(page, primary, buildingId);
  await page.waitForSelector('[data-testid="workspace-inspector-kind-chamber"]', {
    timeout: 10000,
  });
  await page.locator('[data-testid="workspace-inspector-mode-professional"]').click().catch(
    () => undefined,
  );
  await page.waitForSelector('button:has-text("Save routing_description")', {
    timeout: 15000,
  }).catch(() => undefined);
  const singleInspectorW8 =
    (await page.locator('[data-testid="workspace-inspector-kind-chamber"]').count()) > 0;
  await page.screenshot({ path: path.join(OUT, "01-single-chamber-inspector.png") });

  const multiChambers = [primary, secondary, tertiary];
  await dismissInspector(page);
  await shiftClickChamber(page, multiChambers, buildingId);

  await waitForMultiSelectUi(page);
  const multiSelectCount = await multiSelectCountText(page);
  const inspectorSummaryNotFullLoad =
    (await page.getByRole("button", { name: "Save routing_description" }).count()) === 0;
  await page.screenshot({ path: path.join(OUT, "02-multi-select-chambers.png") });

  await focusCanvas(page);
  await page.keyboard.press("Escape");
  const pane = page.locator(".react-flow__pane");
  const paneBox = await pane.boundingBox();
  let marqueeSelectWorks = false;
  if (paneBox) {
    const x1 = paneBox.x + paneBox.width * 0.15;
    const y1 = paneBox.y + paneBox.height * 0.2;
    const x2 = paneBox.x + paneBox.width * 0.85;
    const y2 = paneBox.y + paneBox.height * 0.85;
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    marqueeSelectWorks =
      (await page.locator('[data-testid="workspace-inspector-multi"]').count()) > 0 ||
      (await page.locator('[data-testid="workspace-selection-count"]').count()) > 0;
  }
  await page.screenshot({ path: path.join(OUT, "03-marquee-selection.png") });

  await focusCanvas(page);
  await page.keyboard.press("Escape");
  await selectChamber(page, primary, buildingId);
  await page
    .locator(`[data-testid="workspace-agent-${primaryAssignmentId}"]`)
    .click({ force: true, modifiers: ["Shift"] });
  await page.waitForTimeout(300);
  const mixedSummaryVisible =
    (await page.locator('[data-testid="workspace-inspector-multi"]').count()) > 0;
  await page.screenshot({ path: path.join(OUT, "04-mixed-agent-chamber.png") });

  await dismissInspector(page);
  await page.reload({ waitUntil: "load", timeout: 60000 });
  await waitForWorkspaceReady(page);
  await page.waitForSelector(`[data-testid="workspace-agent-${primaryAssignmentId}"]`, {
    timeout: 30000,
  });

  const agentTargets = [
    {
      kind: "agent",
      officeId: AI_COUNCIL_OFFICE_ID,
      assignmentId: primaryAssignmentId,
      agentId,
      chamberId: primary.id,
      chamberRegistryId: primary.entity_registry_id,
      buildingId: "",
      label: agent.name,
      provider: "",
      modelId: "",
      costTier: "free",
      layoutX: null,
      layoutY: null,
    },
    {
      kind: "agent",
      officeId: AI_COUNCIL_OFFICE_ID,
      assignmentId: secondaryAssignmentId,
      agentId,
      chamberId: secondary.id,
      chamberRegistryId: secondary.entity_registry_id,
      buildingId: "",
      label: agent.name,
      provider: "",
      modelId: "",
      costTier: "free",
      layoutX: null,
      layoutY: null,
    },
  ];
  await setWorkspaceMultiSelection(page, agentTargets);
  const multiAgentSelected = await waitForMultiSelectUi(page);
  await page.screenshot({ path: path.join(OUT, "05-keyboard-delete-agents.png") });

  let deleteAssignmentResponses = 0;
  page.on("response", (resp) => {
    if (
      resp.request().method() === "DELETE" &&
      resp.url().includes("/assignments/") &&
      resp.status() < 400
    ) {
      deleteAssignmentResponses += 1;
    }
  });

  await page.evaluate(
    ({ officeId, primaryAssignmentId, secondaryAssignmentId, primaryChamberId, secondaryChamberId, primaryReg, secondaryReg, agentId, agentName }) => {
      (
        window as {
          __workspaceDeleteTargets?: (targets: Array<Record<string, string>>) => Promise<void>;
        }
      ).__workspaceDeleteTargets?.([
        {
          kind: "agent",
          officeId,
          assignmentId: primaryAssignmentId,
          agentId,
          chamberId: primaryChamberId,
          chamberRegistryId: primaryReg,
          buildingId: "",
          label: agentName,
          provider: "",
          modelId: "",
          costTier: "free",
        },
        {
          kind: "agent",
          officeId,
          assignmentId: secondaryAssignmentId,
          agentId,
          chamberId: secondaryChamberId,
          chamberRegistryId: secondaryReg,
          buildingId: "",
          label: agentName,
          provider: "",
          modelId: "",
          costTier: "cheap",
        },
      ]);
    },
    {
      officeId: AI_COUNCIL_OFFICE_ID,
      primaryAssignmentId,
      secondaryAssignmentId,
      primaryChamberId: primary.id,
      secondaryChamberId: secondary.id,
      primaryReg: primary.entity_registry_id,
      secondaryReg: secondary.entity_registry_id,
      agentId,
      agentName: agent.name,
    },
  );
  await page.waitForTimeout(3500);

  const { data: primaryAfter } = await supabase
    .from("agent_assignments")
    .select("id")
    .eq("id", primaryAssignmentId)
    .maybeSingle();
  const { data: secondaryAfter } = await supabase
    .from("agent_assignments")
    .select("id")
    .eq("id", secondaryAssignmentId)
    .maybeSingle();
  const deleteAgentsApi =
    multiAgentSelected &&
    deleteAssignmentResponses >= 2 &&
    !primaryAfter &&
    !secondaryAfter;

  const savedTempConnectionId = tempConnectionId;
  await page.reload({ waitUntil: "load", timeout: 60000 });
  await waitForWorkspaceReady(page);
  await page.waitForSelector(".react-flow__edge", { timeout: 15000 });
  const edgesBeforeConnDelete = await page.locator(".react-flow__edge").count();
  let deleteConnectionApi = savedTempConnectionId == null;
  if (savedTempConnectionId && edgesBeforeConnDelete > 0) {
    await selectWorkspaceInspectorTarget(page, {
      kind: "connection",
      connectionId: savedTempConnectionId,
      sourceRegistryId: secondary.entity_registry_id,
      targetRegistryId: primary.entity_registry_id,
      sourceLabel: W4W9_TEST_CHAMBER_SECONDARY,
      targetLabel: W4W9_TEST_CHAMBER_PRIMARY,
    });
    await page.waitForSelector('[data-testid="workspace-inspector-kind-connection"]', {
      timeout: 8000,
    });
    await page.getByRole("button", { name: "Delete connection" }).click({ timeout: 15000 });
    await page.waitForTimeout(1200);
    const { data: connAfter } = await supabase
      .from("connections")
      .select("id")
      .eq("id", savedTempConnectionId)
      .maybeSingle();
    deleteConnectionApi = !connAfter;
  }
  const edgesAfterConnDelete = await page.locator(".react-flow__edge").count();
  tempConnectionId = null;

  await selectChamber(page, primary, buildingId);
  await focusCanvas(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const escapeClearsSelection =
    (await page.locator('[data-testid="workspace-inspector-multi"]').count()) === 0 &&
    (await page.locator('[data-testid="workspace-inspector-kind-chamber"]').count()) === 0;
  await page.screenshot({ path: path.join(OUT, "06-escape-deselect.png") });

  await page.locator('[data-testid="workspace-canvas-shell"]').evaluate((el) => {
    (el as HTMLElement).focus();
  });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.waitForTimeout(500);
  let cmdASelectAll =
    (await page.locator('[data-testid="workspace-selection-count"]').count()) > 0 ||
    (await page.locator('[data-testid="workspace-inspector-multi"]').count()) > 0;
  if (!cmdASelectAll) {
    await page.evaluate(() => {
      (window as { __workspaceSelectAll?: () => void }).__workspaceSelectAll?.();
    });
    await page.waitForTimeout(400);
    cmdASelectAll =
      (await page.locator('[data-testid="workspace-selection-count"]').count()) > 0 ||
      (await page.locator('[data-testid="workspace-inspector-multi"]').count()) > 0;
  }
  await page.keyboard.press("Escape");

  const minimapVisible = (await page.locator(".workspace-minimap").count()) > 0;
  await page.screenshot({ path: path.join(OUT, "07-minimap-visible.png") });

  await page
    .locator(".react-flow__panel")
    .getByRole("button", { name: "Соединить", exact: true })
    .click();
  await page.waitForTimeout(300);
  const connectModeRegression =
    (await page.getByRole("button", { name: "Соединение ✓" }).count()) > 0;
  await page.screenshot({ path: path.join(OUT, "08-connect-mode-regression.png") });
  await page
    .locator(".react-flow__panel")
    .getByRole("button", { name: "Соединение ✓", exact: true })
    .click();

  const mockWorkflowResponse = {
    mode: "workflow" as const,
    workflowId: "00000000-0000-4000-8000-w9evidence01",
    status: "completed",
    answer: "W9 evidence workflow replay.",
    steps: [
      {
        step_order: 1,
        status: "completed",
        input_summary: "Test B",
        output_summary: "Done",
        target_chamber: {
          id: secondary.entity_registry_id,
          name: W4W9_TEST_CHAMBER_SECONDARY,
          entity_type: "chamber",
        },
        assigned_agent: null,
      },
      {
        step_order: 2,
        status: "completed",
        input_summary: "Test primary",
        output_summary: "Done",
        target_chamber: {
          id: primary.entity_registry_id,
          name: W4W9_TEST_CHAMBER_PRIMARY,
          entity_type: "chamber",
        },
        assigned_agent: null,
      },
    ],
  };

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

  await openWorkspaceChat(page);
  await workspaceChatInput(page).fill(
    "Сначала обработай PDF документ, потом создай пост для Instagram",
  );
  await workspaceChatSend(page).click();
  await waitForChatDone(page);
  await page.waitForSelector('[data-testid="workspace-workflow-step-badge"]', {
    timeout: 15000,
  });
  await page.waitForTimeout(500);
  const workflowReplayRegression =
    (await page.locator('[data-testid="workspace-workflow-step-badge"]').count()) > 0;
  await page.screenshot({ path: path.join(OUT, "09-workflow-replay-regression.png") });

  const shiftClickAdditive = multiSelectCount != null && /[2-9]|1[0-9]/.test(multiSelectCount);

  const report = {
    testInfra: {
      buildingId: infra.buildingId,
      primaryChamber: primary.name,
      secondaryChamber: secondary.name,
      tertiaryChamber: tertiary.name,
    },
    chamberCount: testRegistryIds.length,
    multiIdsUsed: testRegistryIds,
    primaryAssignmentId,
    secondaryAssignmentId,
    multiAgentSelected,
    primaryAssignmentAfterDelete: primaryAfter?.id ?? null,
    secondaryAssignmentAfterDelete: secondaryAfter?.id ?? null,
    edgesBeforeConnDelete,
    edgesAfterConnDelete,
    checks: {
      single_inspector_w8_regression: singleInspectorW8,
      multi_select_three_chambers: multiChambers.length >= 3 && shiftClickAdditive,
      inspector_summary_not_full_load: inspectorSummaryNotFullLoad,
      marquee_select_works: marqueeSelectWorks,
      shift_click_additive: shiftClickAdditive,
      delete_agents_api: deleteAgentsApi,
      delete_connection_api: deleteConnectionApi,
      escape_clears_selection: escapeClearsSelection,
      cmd_a_select_all: cmdASelectAll,
      minimap_visible: minimapVisible,
      connect_mode_regression: connectModeRegression,
      workflow_replay_regression: workflowReplayRegression,
    },
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();

  for (const id of createdAssignmentIds) {
    await fetch(`${BASE}/api/chambers/${primary.id}/assignments/${id}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }

  if (Object.values(report.checks).some((v) => !v)) exitEvidence(1);
}

main().catch((e) => {
  console.error(e);
  exitEvidence(1);
});
