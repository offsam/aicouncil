/**
 * W10 Live E2E Verification — W10B + W10C (real provider execution)
 * Stops immediately on any failed_live result.
 */
import * as fs from "fs";
import * as path from "path";
import { chromium, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { isProviderError, exitEvidence } from "./evidence-utils"

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w10-live-verification");
const INSTAGRAM = "39d9aa14-6eb3-4359-bd21-ee9a148d62b8";

const COUNCIL_AGENT_IDS = [
  "a1000003-0000-4000-8000-000000000003",
  "a1000006-0000-4000-8000-000000000006",
  "a1000007-0000-4000-8000-000000000007",
];
const TEAM_AGENT_IDS = [
  "a1000005-0000-4000-8000-000000000005",
  "a1000004-0000-4000-8000-000000000004",
  "a1000007-0000-4000-8000-000000000007",
];

type Classification = "verified_live" | "failed_live" | "not_reproducible";

type CheckResult = {
  id: string;
  title: string;
  classification: Classification;
  reason: string;
  screenshot?: string;
  details?: Record<string, unknown>;
};

async function ensureRoster(
  supabase: ReturnType<typeof createClient>,
  agentIds: string[],
  replace = false,
): Promise<void> {
  const { data: chamber } = await supabase
    .from("chambers")
    .select("id")
    .eq("entity_registry_id", INSTAGRAM)
    .maybeSingle();
  if (!chamber?.id) throw new Error("Instagram chamber not found");
  if (replace) {
    await supabase.from("agent_assignments").delete().eq("chamber_id", chamber.id);
  }
  for (const agentId of agentIds) {
    const { data: existing } = await supabase
      .from("agent_assignments")
      .select("id")
      .eq("chamber_id", chamber.id)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("agent_assignments").insert({
        chamber_id: chamber.id,
        agent_id: agentId,
      });
      if (error) throw new Error(`assignment insert: ${error.message}`);
    }
  }
}

async function selectInstagram(page: Page) {
  await page
    .locator(`[data-testid="workspace-chamber-accent-${INSTAGRAM}"]`)
    .click({ force: true });
  await page.waitForTimeout(400);
}

async function waitChatDone(page: Page, timeoutMs = 180000) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll("aside .whitespace-pre-wrap").length >= 2 &&
      !document.body.textContent?.includes("Маршрутизация…") &&
      !document.body.textContent?.includes("Council: сбор") &&
      !document.body.textContent?.includes("Team: сбор"),
    { timeout: timeoutMs },
  );
}

async function canvasHighlightStats(page: Page) {
  return page.evaluate(() => ({
    routeNodes: document.querySelectorAll(".workspace-route-node").length,
    highlightedNodes: document.querySelectorAll(".workspace-node-route-highlight").length,
    routeBadges: document.querySelectorAll(".workspace-route-step-badge").length,
  }));
}

function writeReport(
  checks: CheckResult[],
  opts: { stoppedEarly: boolean; providerOk: boolean },
) {
  const report = {
    step: "W10-live-verification",
    title: "Final Live E2E — W10B + W10C",
    timestamp: new Date().toISOString(),
    providerOk: opts.providerOk,
    stoppedEarly: opts.stoppedEarly,
    blockersOpen: checks.filter((c) => c.classification === "failed_live").map((c) => c.id),
    checks,
    pass: checks.every((c) => c.classification !== "failed_live"),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const checks: CheckResult[] = [];
  let stoppedEarly = false;

  const probe = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskText: "live verification ping", executionMode: "fast" }),
  });
  const probeData = await probe.json();
  const providerOk = probe.ok && !isProviderError(String(probeData.error ?? ""));

  if (!providerOk) {
    const r = writeReport(
      [
        {
          id: "provider_probe",
          title: "Provider availability",
          classification: "failed_live",
          reason: `Provider still blocked: ${probeData.error ?? probe.status}`,
        },
      ],
      { stoppedEarly: true, providerOk: false },
    );
    exitEvidence(r.pass ? 0 : 1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  await ensureRoster(supabase, COUNCIL_AGENT_IDS, true);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("dialog", (d) => void d.accept());

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="workspace-execution-mode-selector"]', {
    timeout: 30000,
  });

  // Check 1: Council Report Panel
  {
    const id = "council_report_panel";
    await selectInstagram(page);
    await page.locator('[data-testid="workspace-execution-mode-council"]').click();
    const taskText = `W10 live Council ${Date.now()}`;
    await page.locator("aside input").first().fill(taskText);
    await page.locator("aside button[type=submit]").first().click();
    await page.waitForSelector('[data-testid="workspace-council-confirmation-gate"]', {
      timeout: 15000,
    });
    await page.locator('[data-testid="workspace-council-gate-confirm"]').click();

    let councilOk = false;
    let details: Record<string, unknown> = {};
    try {
      await page.waitForSelector(
        '[data-testid="workspace-council-report-panel"], aside .text-red-400',
        { timeout: 240000 },
      );
      const panelVisible =
        (await page.locator('[data-testid="workspace-council-report-panel"]').count()) > 0;
      const blocks = {
        consensus:
          (await page.locator('[data-testid="workspace-council-block-consensus"]').count()) > 0,
        differences:
          (await page.locator('[data-testid="workspace-council-block-differences"]').count()) > 0,
        bestAnswer:
          (await page.locator('[data-testid="workspace-council-block-bestAnswer"]').count()) > 0,
        finalVerdict:
          (await page.locator('[data-testid="workspace-council-block-finalVerdict"]').count()) > 0,
      };
      const errText = await page.locator("aside .text-red-400").last().textContent().catch(() => "");
      details = { panelVisible, blocks, errText: errText?.slice(0, 200) };
      councilOk =
        panelVisible &&
        blocks.consensus &&
        blocks.differences &&
        blocks.bestAnswer &&
        blocks.finalVerdict;
      if (councilOk) {
        await page.screenshot({ path: path.join(OUT, "01-council-report-panel.png") });
      }
    } catch (e) {
      details = { error: e instanceof Error ? e.message : String(e) };
    }

    const result: CheckResult = {
      id,
      title: "Council Report Panel — 4 blocks live",
      classification: councilOk ? "verified_live" : "failed_live",
      reason: councilOk
        ? "Council completed; consensus/differences/bestAnswer/finalVerdict visible in UI"
        : `Council report incomplete or error: ${JSON.stringify(details)}`,
      screenshot: councilOk ? "01-council-report-panel.png" : undefined,
      details,
    };
    checks.push(result);
    if (result.classification === "failed_live") {
      stoppedEarly = true;
      await browser.close();
      const r = writeReport(checks, { stoppedEarly, providerOk });
      exitEvidence(r.pass ? 0 : 1);
    }
  }

  // Check 2: Team Panel
  {
    await ensureRoster(supabase, [...new Set([...COUNCIL_AGENT_IDS, ...TEAM_AGENT_IDS])]);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="workspace-execution-mode-selector"]', {
      timeout: 30000,
    });
    await selectInstagram(page);
    await page.locator('[data-testid="workspace-execution-mode-team"]').click();
    const teamTask = `W10 live Team ${Date.now()}`;
    await page.locator("aside input").first().fill(teamTask);
    await page.locator("aside button[type=submit]").first().click();

    const id = "team_answers_panel";
    let teamOk = false;
    let details: Record<string, unknown> = {};
    try {
      await page.waitForSelector(
        '[data-testid="workspace-team-answers-panel"], aside .text-red-400',
        { timeout: 240000 },
      );
      const panelVisible =
        (await page.locator('[data-testid="workspace-team-answers-panel"]').count()) > 0;
      const agentCards = await page.locator('[data-testid^="workspace-team-agent-"]').count();
      const summary = await page
        .locator('[data-testid="workspace-team-summary"]')
        .textContent()
        .catch(() => "");
      const errText = await page.locator("aside .text-red-400").last().textContent().catch(() => "");
      details = {
        panelVisible,
        agentCards,
        summaryLength: summary?.trim().length ?? 0,
        errText: errText?.slice(0, 200),
      };
      teamOk = panelVisible && agentCards >= 2 && (summary?.trim().length ?? 0) > 10;
      if (teamOk) {
        await page.screenshot({ path: path.join(OUT, "02-team-answers-panel.png") });
      }
    } catch (e) {
      details = { error: e instanceof Error ? e.message : String(e) };
    }

    const result: CheckResult = {
      id,
      title: "TeamAnswersPanel — multi-agent live",
      classification: teamOk ? "verified_live" : "failed_live",
      reason: teamOk
        ? `Team panel with ${details.agentCards} agent cards and synthesis summary`
        : `Team panel failed: ${JSON.stringify(details)}`,
      screenshot: teamOk ? "02-team-answers-panel.png" : undefined,
      details,
    };
    checks.push(result);
    if (result.classification === "failed_live") {
      stoppedEarly = true;
      await browser.close();
      const r = writeReport(checks, { stoppedEarly, providerOk });
      exitEvidence(r.pass ? 0 : 1);
    }
  }

  // Check 3: Canvas highlight
  {
    const id = "canvas_multi_agent_highlight";
    const stats = await canvasHighlightStats(page);
    const canvasOk = stats.highlightedNodes >= 2 && stats.routeNodes >= 2;
    if (canvasOk) {
      await page.screenshot({ path: path.join(OUT, "03-canvas-route-highlight.png") });
    }
    const result: CheckResult = {
      id,
      title: "Canvas multi-agent route highlight",
      classification: canvasOk ? "verified_live" : "failed_live",
      reason: canvasOk
        ? `${stats.highlightedNodes} highlighted nodes, ${stats.routeNodes} route nodes on canvas`
        : `Insufficient canvas highlight after live Team run: ${JSON.stringify(stats)}`,
      screenshot: canvasOk ? "03-canvas-route-highlight.png" : undefined,
      details: stats,
    };
    checks.push(result);
    if (result.classification === "failed_live") {
      stoppedEarly = true;
      await browser.close();
      const r = writeReport(checks, { stoppedEarly, providerOk });
      exitEvidence(r.pass ? 0 : 1);
    }
  }

  // Check 4: W10C last participation badge
  {
    const id = "w10c_last_participation_badge";
    let badgeOk = false;
    let details: Record<string, unknown> = {};
    try {
      const highlightedAgent = page
        .locator(".react-flow__node-agent.workspace-node-route-highlight")
        .first();
      if ((await highlightedAgent.count()) === 0) {
        await page.locator(".react-flow__node-agent").first().click({ force: true });
      } else {
        await highlightedAgent.click({ force: true });
      }
      await page.waitForSelector('[data-testid="workspace-inspector-kind-agent"]', {
        timeout: 8000,
      });
      await page.locator('[data-testid="workspace-context-preview"] button').first().click();
      await page.waitForSelector('[data-testid="workspace-context-preview-last-run"]', {
        timeout: 10000,
      });
      badgeOk =
        (await page.locator('[data-testid="workspace-context-preview-last-run"]').count()) > 0;
      details = {
        badgeVisible: badgeOk,
        badgeText: await page
          .locator('[data-testid="workspace-context-preview-last-run"]')
          .textContent(),
      };
      if (badgeOk) {
        await page.screenshot({ path: path.join(OUT, "04-w10c-last-run-badge.png") });
      }
    } catch (e) {
      details = { error: e instanceof Error ? e.message : String(e) };
    }

    const result: CheckResult = {
      id,
      title: "W10C Context Preview — last Team run badge",
      classification: badgeOk ? "verified_live" : "failed_live",
      reason: badgeOk
        ? "From last team run badge visible after live Team execution"
        : `Badge not shown after live Team run: ${JSON.stringify(details)}`,
      screenshot: badgeOk ? "04-w10c-last-run-badge.png" : undefined,
      details,
    };
    checks.push(result);
    if (result.classification === "failed_live") {
      stoppedEarly = true;
      await browser.close();
      const r = writeReport(checks, { stoppedEarly, providerOk });
      exitEvidence(r.pass ? 0 : 1);
    }
  }

  await browser.close();

  // Check 5: W4 highlight after refresh
  {
    const id = "w4_highlight_after_refresh";
    const browser2 = await chromium.launch({ headless: true });
    const page2 = await browser2.newPage({ viewport: { width: 1440, height: 900 } });
    await page2.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
    await page2.waitForSelector(".workspace-flow", { timeout: 30000 });

    const chatInput = page2.locator('aside input[placeholder*="Instagram"]');
    await chatInput.fill("Напиши короткий caption для Instagram");
    await page2.locator('aside button[type=submit]').click();
    await waitChatDone(page2, 120000);

    const err1 = await page2.locator("aside .text-red-400").count();
    const assistant1 = await page2.locator("aside .whitespace-pre-wrap").last().textContent();
    if (err1 > 0 || isProviderError(assistant1 ?? "")) {
      checks.push({
        id,
        title: "W4 route highlight after refresh",
        classification: "failed_live",
        reason: `First chat failed: ${assistant1?.slice(0, 200)}`,
      });
      stoppedEarly = true;
      await browser2.close();
      const r = writeReport(checks, { stoppedEarly, providerOk });
      exitEvidence(r.pass ? 0 : 1);
    }

    await page2.waitForTimeout(800);
    const badgeBefore = await page2.locator(".workspace-route-step-badge").count();
    await page2.screenshot({ path: path.join(OUT, "05-w4-before-refresh.png") });

    await page2.reload({ waitUntil: "networkidle" });
    await page2.waitForSelector(".workspace-flow", { timeout: 30000 });
    await chatInput.waitFor({ timeout: 10000 });
    await chatInput.fill("Сделай короткий пост для Instagram");
    await page2.locator('aside button[type=submit]').click();
    await waitChatDone(page2, 120000);

    const err2 = await page2.locator("aside .text-red-400").count();
    if (err2 > 0) {
      checks.push({
        id,
        title: "W4 route highlight after refresh",
        classification: "failed_live",
        reason: "Second chat after refresh failed",
        details: { badgeBefore },
      });
      stoppedEarly = true;
      await browser2.close();
      const r = writeReport(checks, { stoppedEarly, providerOk });
      exitEvidence(r.pass ? 0 : 1);
    }

    await page2.waitForTimeout(800);
    const badgeAfter = await page2.locator(".workspace-route-step-badge").count();
    await page2.screenshot({ path: path.join(OUT, "06-w4-after-refresh.png") });

    const w4Ok = badgeBefore >= 2 && badgeAfter >= 2;
    checks.push({
      id,
      title: "W4 route highlight after refresh",
      classification: w4Ok ? "verified_live" : "failed_live",
      reason: w4Ok
        ? `Route badges persist: before=${badgeBefore}, after refresh=${badgeAfter}`
        : `Highlight issue: before=${badgeBefore}, after=${badgeAfter}`,
      screenshot: w4Ok ? "06-w4-after-refresh.png" : "05-w4-before-refresh.png",
      details: { badgeBefore, badgeAfter },
    });

    if (checks[checks.length - 1].classification === "failed_live") {
      stoppedEarly = true;
      await browser2.close();
      const r = writeReport(checks, { stoppedEarly, providerOk });
      exitEvidence(r.pass ? 0 : 1);
    }
    await browser2.close();
  }

  const r = writeReport(checks, { stoppedEarly, providerOk });
  if (!r.pass) exitEvidence(1);
  console.log("W10 LIVE VERIFICATION — ALL CHECKS PASS");
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1);
});
