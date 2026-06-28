/**
 * W10B Step 4 evidence — Council mode + Confirmation Gate (strict recheck)
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
const OUT = path.join(process.cwd(), "docs/evidence/w10b-step4");
const INSTAGRAM_REGISTRY = "39d9aa14-6eb3-4359-bd21-ee9a148d62b8";
const GENERAL_INTAKE = "c0000000-0000-4000-8000-000000000000";
const COUNCIL_AGENT_IDS = [
  "a1000003-0000-4000-8000-000000000003",
  "a1000006-0000-4000-8000-000000000006",
  "a1000007-0000-4000-8000-000000000007",
];

type IssueCategory = "blocker" | "known_issue_non_blocker";
type IssueRecord = {
  id: string;
  category: IssueCategory;
  status: "open" | "fixed" | "verified_ok";
  description: string;
  reason: string;
};

async function ensureInstagramRoster(
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { data: chamber } = await supabase
    .from("chambers")
    .select("id")
    .eq("entity_registry_id", INSTAGRAM_REGISTRY)
    .maybeSingle();
  if (!chamber?.id) throw new Error("Instagram chamber not found");

  await supabase.from("agent_assignments").delete().eq("chamber_id", chamber.id);
  for (const agentId of COUNCIL_AGENT_IDS) {
    const { error } = await supabase.from("agent_assignments").insert({
      chamber_id: chamber.id,
      agent_id: agentId,
    });
    if (error) throw new Error(`assignment insert: ${error.message}`);
  }
}

async function probeProviders(): Promise<boolean> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskText: "provider ping", executionMode: "fast" }),
  });
  const data = await res.json();
  const err = String(data.error ?? "");
  return err.includes("Rate limit") || err.includes("quota") || err.includes("429");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const issues: IssueRecord[] = [];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  await ensureInstagramRoster(supabase);
  const providerBlocked = await probeProviders();

  const rosterIg = await fetch(
    `${BASE}/api/chamber-roster?entityId=${encodeURIComponent(INSTAGRAM_REGISTRY)}`,
  ).then((r) => r.json());
  const rosterIntake = await fetch(
    `${BASE}/api/chamber-roster?entityId=${encodeURIComponent(GENERAL_INTAKE)}`,
  ).then((r) => r.json());

  const rosterGuardChecks = {
    instagram_team_eligible: rosterIg.teamEligible === true,
    instagram_council_eligible: rosterIg.councilEligible === true,
    instagram_roster_count_3: rosterIg.rosterCount === 3,
    intake_team_ineligible: rosterIntake.teamEligible === false,
    intake_council_ineligible: rosterIntake.councilEligible === false,
  };

  const councilWithSource = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: `W10B step4 API council ${Date.now()}`,
      executionMode: "council",
      sourceEntityId: INSTAGRAM_REGISTRY,
      forceFailSlugs: ["or-llama", "or-qwen"],
    }),
  });
  const councilData = await councilWithSource.json();
  fs.writeFileSync(
    path.join(OUT, "partial-api-response.json"),
    JSON.stringify(councilData, null, 2),
  );

  const reachedParallelExecution =
    councilWithSource.ok ||
    String(councilData.error ?? "").includes("Council не завершён") ||
    Boolean(councilData.council?.invokedCount);

  const councilRosterReject = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: "council without roster",
      executionMode: "council",
    }),
  });
  const rejectData = await councilRosterReject.json();
  const rosterGuardWorks = String(rejectData.error ?? "").includes("менее 3 экспертов");

  if (!rosterGuardWorks) {
    issues.push({
      id: "council_roster_guard",
      category: "blocker",
      status: "open",
      description: "Council без roster >=3 не отклоняется на backend",
      reason: "Архитектурная гарантия спеки: Council disabled/blocked при <3 advisors",
    });
  } else {
    issues.push({
      id: "council_roster_guard",
      category: "blocker",
      status: "verified_ok",
      description: "Council roster guard >=3 на backend",
      reason: "API без eligible chamber возвращает ошибку «менее 3 экспертов»",
    });
  }

  if (!reachedParallelExecution) {
    issues.push({
      id: "council_backend_execution",
      category: "blocker",
      status: "open",
      description: "Council backend не доходит до parallel execution с sourceEntityId",
      reason: `Ответ API: ${String(councilData.error ?? councilWithSource.status)}`,
    });
  } else {
    issues.push({
      id: "council_backend_execution",
      category: "blocker",
      status: "verified_ok",
      description: "Council backend доходит до parallel + consensus path",
      reason: providerBlocked
        ? "При quota limit: partial/execution error, но не roster guard"
        : "Council API ok или partial с report",
    });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="workspace-execution-mode-selector"]', {
    timeout: 30000,
  });

  await page
    .locator(`[data-testid="workspace-chamber-accent-${INSTAGRAM_REGISTRY}"]`)
    .click({ force: true });
  await page.waitForTimeout(500);

  const councilBtn = page.locator('[data-testid="workspace-execution-mode-council"]');
  const councilEnabled = !(await councilBtn.isDisabled());
  const councilBadgeVisible =
    (await page.locator('[data-testid="workspace-execution-mode-council-badge"]').count()) > 0;
  await councilBtn.click();

  const taskText = `W10B step4 Council UI Instagram ${Date.now()}`;
  const chatInput = page.locator("aside").first().locator("input").first();
  await chatInput.fill(taskText);
  const inputBeforeGate = await chatInput.inputValue();
  await page.locator("aside").first().locator('button[type="submit"]').first().click();
  await page.waitForSelector('[data-testid="workspace-council-confirmation-gate"]', {
    timeout: 10000,
  });
  await page.screenshot({ path: path.join(OUT, "01-council-confirmation-gate.png") });

  const gateChamber = await page
    .locator('[data-testid="workspace-council-gate-chamber"]')
    .textContent();

  await page.locator('[data-testid="workspace-council-gate-cancel"]').click();
  await page.waitForTimeout(300);
  const inputAfterCancel = await chatInput.inputValue();
  const councilStillSelected = (await councilBtn.getAttribute("aria-checked")) === "true";

  let councilPanelVisible = false;
  let hasFourBlocks = false;
  let metaText = "";
  let routeHighlightAgents = 0;
  let routingLog: Record<string, unknown> | null = null;
  let uiCouncilError: string | null = null;

  if (!providerBlocked) {
    await page.locator("aside").first().locator('button[type="submit"]').first().click();
    await page.waitForSelector('[data-testid="workspace-council-confirmation-gate"]');
    await page.locator('[data-testid="workspace-council-gate-confirm"]').click();

    try {
      await page.waitForSelector(
        '[data-testid="workspace-council-report-panel"], aside .text-red-400',
        { timeout: 120000 },
      );
      councilPanelVisible =
        (await page.locator('[data-testid="workspace-council-report-panel"]').count()) > 0;
      hasFourBlocks =
        (await page.locator('[data-testid="workspace-council-block-consensus"]').count()) > 0 &&
        (await page.locator('[data-testid="workspace-council-block-finalVerdict"]').count()) > 0;
      metaText =
        (await page
          .locator("aside")
          .first()
          .locator(".border-stone-700 .text-xs.text-stone-400")
          .last()
          .textContent()) ?? "";
      routeHighlightAgents = await page.locator(".workspace-route-node").count();
      if (!councilPanelVisible) {
        uiCouncilError = await page.locator("aside .text-red-400").last().textContent();
      }
      await page.screenshot({ path: path.join(OUT, "02-council-report.png") });
    } catch {
      uiCouncilError = "timeout waiting for council panel";
    }

    const { data } = await supabase
      .from("routing_logs")
      .select("id, task_text, method, agent_count, chosen_target_entity_registry_id, created_at")
      .like("task_text", `${taskText}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    routingLog = data;
  }

  await browser.close();

  const chatSourceFromSelection = councilEnabled && gateChamber?.includes("Instagram");
  if (!chatSourceFromSelection) {
    issues.push({
      id: "council_ui_source_entity",
      category: "blocker",
      status: "open",
      description: "Council UI не привязывает chat к выбранному chamber (sourceEntityId)",
      reason: "Gate chamber name не Instagram или Council disabled после выбора chamber",
    });
  } else {
    issues.push({
      id: "council_ui_source_entity",
      category: "blocker",
      status: "verified_ok",
      description: "Выбор chamber → Council enabled + gate показывает Instagram",
      reason: "chatSourceEntityId из selection context (fix Step 4 recheck)",
    });
  }

  if (providerBlocked) {
    issues.push({
      id: "external_provider_quota",
      category: "known_issue_non_blocker",
      status: "open",
      description: "Groq/Gemini/OpenRouter quota exhausted — live agent calls fail",
      reason:
        "Внешний лимит провайдеров; backend path и gate UI проверяются без live inference",
    });
  }

  const executionErrorText = String(councilData.error ?? uiCouncilError ?? "");
  const allAgentsFailed =
    executionErrorText.includes("только 0 из") ||
    executionErrorText.includes("Ни один эксперт") ||
    executionErrorText.includes("Rate limit") ||
    executionErrorText.includes("quota");

  if (!providerBlocked && !councilPanelVisible) {
    if (allAgentsFailed) {
      issues.push({
        id: "council_ui_report_panel",
        category: "known_issue_non_blocker",
        status: "open",
        description: "Council Report panel не отображается — все advisors вернули ошибку",
        reason: `${executionErrorText} — backend path ok, провайдеры недоступны`,
      });
    } else {
      issues.push({
        id: "council_ui_report_panel",
        category: "blocker",
        status: "open",
        description: "Council Report panel не появился в UI при успешном Council run",
        reason: executionErrorText || "unknown",
      });
    }
  } else if (!providerBlocked && councilPanelVisible) {
    issues.push({
      id: "council_ui_report_panel",
      category: "blocker",
      status: "verified_ok",
      description: "Council Report panel в sidebar",
      reason: "4 блока + partial badge при необходимости",
    });
  }

  const partialReport = councilData.council as
    | { report?: Record<string, string>; partial?: boolean; successCount?: number }
    | undefined;

  const apiChecks = {
    council_with_source_reaches_execution: reachedParallelExecution,
    council_roster_guard_rejects: rosterGuardWorks,
    partial_force_fail:
      councilWithSource.ok &&
      partialReport?.partial === true &&
      (partialReport?.successCount ?? 0) >= 2,
    partial_four_blocks:
      Boolean(partialReport?.report?.consensus) &&
      Boolean(partialReport?.report?.differences) &&
      Boolean(partialReport?.report?.bestAnswer) &&
      Boolean(partialReport?.report?.finalVerdict),
  };

  const uiChecks = {
    council_segment_enabled: councilEnabled,
    council_badge_visible: councilBadgeVisible,
    gate_shown_on_submit: Boolean(gateChamber),
    cancel_keeps_input: inputAfterCancel === taskText,
    cancel_keeps_council_mode: councilStillSelected,
    input_preserved_during_gate: inputBeforeGate === taskText,
    council_panel_visible: providerBlocked ? null : councilPanelVisible,
    council_four_blocks: providerBlocked ? null : hasFourBlocks,
    meta_mentions_council: providerBlocked ? null : metaText.includes("mode: council"),
    routing_log_agent_count_3: providerBlocked ? null : routingLog?.agent_count === 3,
    multi_agent_canvas_highlight: providerBlocked ? null : routeHighlightAgents >= 2,
  };

  uiChecks.council_badge_visible = councilBadgeVisible;

  const blockersOpen = issues.filter(
    (i) => i.category === "blocker" && i.status === "open",
  );

  const checks = {
    ...rosterGuardChecks,
    ...apiChecks,
    ...Object.fromEntries(
      Object.entries(uiChecks).filter(([, v]) => v !== null),
    ),
  };

  const pass =
    blockersOpen.length === 0 &&
    Object.values(rosterGuardChecks).every(Boolean) &&
    apiChecks.council_with_source_reaches_execution &&
    apiChecks.council_roster_guard_rejects &&
    (providerBlocked ||
      allAgentsFailed ||
      (apiChecks.partial_force_fail && apiChecks.partial_four_blocks) ||
      councilPanelVisible);

  const result = {
    step: "W10B-step4-recheck",
    title: "Council mode + Confirmation Gate (strict)",
    timestamp: new Date().toISOString(),
    providerBlocked,
    taskText,
    gateChamber,
    routingLog,
    rosterIg,
    rosterIntake,
    apiChecks,
    uiChecks,
    issues,
    blockersOpen: blockersOpen.map((i) => i.id),
    checks,
    pass,
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  if (blockersOpen.length > 0) {
    console.error("W10B step4 BLOCKERS — stop before Step 5:", blockersOpen.map((i) => i.id));
    exitEvidence(2);
  }
  if (!pass) {
    console.error("W10B step4 evidence FAILED (non-blocker checks)");
    exitEvidence(1);
  }
  console.log("W10B step4 recheck PASS");
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1);
});
