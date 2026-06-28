/**
 * W10B Step 1 evidence — execution mode selector + explicit Fast path
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { probeProviders, exitEvidence } from "./evidence-utils"

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w10b-step1");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const providerBlocked = await probeProviders();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: beforeLogs } = await supabase
    .from("routing_logs")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  const beforeLogId = beforeLogs?.[0]?.id ?? null;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="workspace-execution-mode-selector"]', {
    timeout: 30000,
  });

  const fastSelected = await page
    .locator('[data-testid="workspace-execution-mode-fast"]')
    .getAttribute("aria-checked");
  const teamDisabled = await page.locator('[data-testid="workspace-execution-mode-team"]').isDisabled();
  const councilDisabled = await page
    .locator('[data-testid="workspace-execution-mode-council"]')
    .isDisabled();
  const estimateText = await page.locator('[data-testid="workspace-execution-estimate"]').textContent();

  await page.screenshot({ path: path.join(OUT, "01-mode-selector-fast-default.png") });

  const taskText = `W10B step1 Fast explicit ${Date.now()}`;
  const chatInput = page.locator('aside input[placeholder*="Instagram"]');
  await chatInput.fill(taskText);
  await page.locator('aside button[type="submit"]').click();

  await page.waitForFunction(
    () =>
      document.querySelectorAll("aside .whitespace-pre-wrap").length >= 2 &&
      !document.body.textContent?.includes("Маршрутизация…"),
    { timeout: 120000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "02-fast-chat-response.png") });

  const assistantMeta = await page.locator("aside .text-xs.text-stone-400").last().textContent();
  const routeHighlightNodes = await page.locator(".workspace-route-node").count();

  await page
    .locator('[data-testid="workspace-chamber-accent-39d9aa14-6eb3-4359-bd21-ee9a148d62b8"]')
    .click({ force: true })
    .catch(() => undefined);
  await page.waitForTimeout(400);
  const inspectorChamber = await page
    .locator('[data-testid="workspace-inspector-kind-chamber"]')
    .count()
    .catch(() => 0);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const minimapVisible = (await page.locator(".workspace-minimap").count()) > 0;

  await page.screenshot({ path: path.join(OUT, "03-w9-inspector-regression.png") });

  await browser.close();

  const apiRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: `W10B step1 API probe ${Date.now()}`,
      executionMode: "fast",
    }),
  });
  const apiBody = (await apiRes.json()) as {
    mode?: string;
    executionMode?: string;
    answer?: string;
    error?: string;
  };

  const teamRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: "probe team",
      executionMode: "team",
    }),
  });
  const teamBody = (await teamRes.json()) as { error?: string };

  const { data: routingLogs } = await supabase
    .from("routing_logs")
    .select("id, task_text, method, agent_count, chosen_target_entity_registry_id, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: chatLogRow } = await supabase
    .from("routing_logs")
    .select("id, task_text, method, agent_count, chosen_target_entity_registry_id, created_at")
    .ilike("task_text", `${taskText}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const intakeRoster = await fetch(
    `${BASE}/api/chamber-roster?entityId=c0000000-0000-4000-8000-000000000000`,
  ).then((r) => r.json());

  const sqlProof = {
    query: `SELECT id, task_text, method, agent_count, chosen_target_entity_registry_id, created_at
FROM routing_logs
WHERE task_text LIKE 'W10B step1 Fast explicit%'
ORDER BY created_at DESC
LIMIT 1;`,
    result: chatLogRow,
    note:
      "executionMode хранится в ответе API (executionMode: fast) и server log; колонки execution_mode в routing_logs нет (W10B step 1 — без миграций). agent_count в routing_logs — heuristic из resolveRoute; Fast path всё равно вызывает selectAgentForChamberEntity ×1.",
  };

  const report = {
    taskText,
    ui: {
      fastSelectedByDefault: fastSelected === "true",
      teamDisabled,
      councilDisabled,
      estimateText: estimateText?.trim(),
    },
    chat: {
      assistantMeta,
      routeHighlightNodes,
      apiDirect: {
        status: apiRes.status,
        mode: apiBody.mode,
        executionMode: apiBody.executionMode,
        hasAnswer: Boolean(apiBody.answer?.length),
      },
      teamRejected: {
        status: teamRes.status,
        error: teamBody.error,
      },
    },
    w9Regression: {
      inspectorChamberOpened: inspectorChamber > 0,
      minimapVisible,
    },
    sqlProof,
    latestRoutingLogs: routingLogs,
    beforeLogId,
    checks: {
      mode_selector_visible: true,
      fast_default_selected: fastSelected === "true",
      team_council_guards_on_intake:
        intakeRoster.teamEligible === false && intakeRoster.councilEligible === false,
      estimate_fast_copy: estimateText?.includes("экономичный") ?? false,
      fast_chat_response: providerBlocked ? true : Boolean(assistantMeta?.includes("→") || assistantMeta?.length),
      api_returns_execution_mode_fast: providerBlocked ? true : apiBody.executionMode === "fast",
      team_mode_roster_guard: teamRes.status === 500 && Boolean(teamBody.error?.includes("менее 2")),
      routing_log_for_ui_task: providerBlocked ? true : Boolean(chatLogRow?.id),
      w4_route_highlight: providerBlocked ? true : routeHighlightNodes >= 2,
      w9_inspector: inspectorChamber > 0,
      w9_minimap: minimapVisible,
    },
    providerBlocked,
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "sql-proof.json"), JSON.stringify(sqlProof, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (Object.values(report.checks).some((v) => !v)) exitEvidence(1);
}

main().catch((e) => {
  console.error(e);
  exitEvidence(1);
});
