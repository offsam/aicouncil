/**
 * Live Council + Team verification with real OpenRouter models and fallback logs.
 */
import * as fs from "fs";
import * as path from "path";
import { chromium, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/council-team-live-gemini-fix");
const INSTAGRAM = "39d9aa14-6eb3-4359-bd21-ee9a148d62b8";
const TERMINALS_DIR = path.join(
  process.env.HOME ?? "",
  ".cursor/projects/Users-sammov-AI-consult/terminals",
);

function findDevServerLog(): string {
  const files = fs
    .readdirSync(TERMINALS_DIR)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => path.join(TERMINALS_DIR, f))
    .filter((p) => fs.readFileSync(p, "utf8").includes("next dev"))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] ?? path.join(TERMINALS_DIR, "301633.txt");
}

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

function logLineCount(serverLog: string): number {
  if (!fs.existsSync(serverLog)) return 0;
  return fs.readFileSync(serverLog, "utf8").split("\n").length;
}

function extractServerLogs(fromLine: number, serverLog: string): string[] {
  if (!fs.existsSync(serverLog)) return [];
  const lines = fs.readFileSync(serverLog, "utf8").split("\n");
  return lines
    .slice(fromLine)
    .filter((l) =>
      /\[openrouter\]|\[gemini\]|\[executeParallelAgents\]|\[executeChatTask\] executionMode=(council|team)/.test(
        l,
      ),
    );
}

async function ensureRoster(
  supabase: ReturnType<typeof createClient>,
  agentIds: string[],
  replace = false,
) {
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
      if (error) throw new Error(error.message);
    }
  }
}

async function selectInstagram(page: Page) {
  await page
    .locator(`[data-testid="workspace-chamber-accent-${INSTAGRAM}"]`)
    .click({ force: true });
  await page.waitForTimeout(400);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const serverLog = findDevServerLog();
  const logStart = logLineCount(serverLog);
  const ts = Date.now();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  await ensureRoster(supabase, COUNCIL_AGENT_IDS, true);

  const councilTask = `OpenRouter live Council ${ts}`;
  const councilRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: councilTask,
      executionMode: "council",
      sourceEntityId: INSTAGRAM,
    }),
  });
  const councilData = await councilRes.json();
  fs.writeFileSync(path.join(OUT, "council-api-response.json"), JSON.stringify(councilData, null, 2));

  const councilAgents = (councilData.council?.agents ?? []) as Array<{
    slug: string;
    status: string;
    answer?: string;
    error?: string;
    latencyMs?: number;
  }>;
  const councilSuccess = councilAgents.filter((a) => a.status === "success" && a.answer);
  const councilReport = councilData.council?.report ?? councilData.council?.synthesis;
  const councilReportBlocks = {
    consensus: Boolean(councilReport?.consensus),
    differences: Boolean(councilReport?.differences),
    bestAnswer: Boolean(councilReport?.bestAnswer),
    finalVerdict: Boolean(councilReport?.finalVerdict),
  };
  const councilApiOk =
    councilRes.ok &&
    councilSuccess.length >= 2 &&
    Object.values(councilReportBlocks).every(Boolean);

  await ensureRoster(supabase, [...new Set([...COUNCIL_AGENT_IDS, ...TEAM_AGENT_IDS])]);

  const teamTask = `OpenRouter live Team ${ts}`;
  const teamRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: teamTask,
      executionMode: "team",
      sourceEntityId: INSTAGRAM,
    }),
  });
  const teamData = await teamRes.json();
  fs.writeFileSync(path.join(OUT, "team-api-response.json"), JSON.stringify(teamData, null, 2));

  const teamAgents = (teamData.team?.agents ?? []) as Array<{
    slug: string;
    status: string;
    answer?: string;
    error?: string;
  }>;
  const teamSuccess = teamAgents.filter((a) => a.status === "success" && a.answer);
  const teamApiOk =
    teamRes.ok &&
    teamSuccess.length >= 2 &&
    (teamData.team?.summary?.trim().length ?? 0) > 20;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("dialog", (d) => void d.accept());

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="workspace-execution-mode-selector"]', {
    timeout: 30000,
  });

  // Council UI
  await selectInstagram(page);
  await page.locator('[data-testid="workspace-execution-mode-council"]').click();
  const councilUiTask = `OpenRouter live Council UI ${ts}`;
  await page.locator("aside input").first().fill(councilUiTask);
  await page.locator("aside button[type=submit]").first().click();
  await page.waitForSelector('[data-testid="workspace-council-confirmation-gate"]', {
    timeout: 15000,
  });
  await page.locator('[data-testid="workspace-council-gate-confirm"]').click();

  let councilUiOk = false;
  let councilUiDetails: Record<string, unknown> = {};
  try {
    await page.waitForSelector(
      '[data-testid="workspace-council-report-panel"], aside .text-red-400',
      { timeout: 300000 },
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
    const agentCards = await page.locator('[data-testid^="workspace-council-agent-"]').count();
    councilUiDetails = { panelVisible, blocks, agentCards };
    councilUiOk =
      panelVisible && Object.values(blocks).every(Boolean);
    await page.screenshot({ path: path.join(OUT, "01-council-report-panel.png"), fullPage: false });
  } catch (e) {
    councilUiDetails = { error: e instanceof Error ? e.message : String(e) };
    await page.screenshot({ path: path.join(OUT, "01-council-failed.png"), fullPage: false });
  }

  // Team UI
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="workspace-execution-mode-selector"]', {
    timeout: 30000,
  });
  await selectInstagram(page);
  await page.locator('[data-testid="workspace-execution-mode-team"]').click();
  const teamUiTask = `OpenRouter live Team UI ${ts}`;
  await page.locator("aside input").first().fill(teamUiTask);
  await page.locator("aside button[type=submit]").first().click();

  let teamUiOk = false;
  let teamUiDetails: Record<string, unknown> = {};
  try {
    await page.waitForSelector(
      '[data-testid="workspace-team-answers-panel"], aside .text-red-400',
      { timeout: 300000 },
    );
    const panelVisible =
      (await page.locator('[data-testid="workspace-team-answers-panel"]').count()) > 0;
    const agentCards = await page.locator('[data-testid^="workspace-team-agent-"]').count();
    const answersWithText = await page
      .locator('[data-testid^="workspace-team-agent-"] .whitespace-pre-wrap')
      .evaluateAll((els) => els.filter((el) => (el.textContent?.trim().length ?? 0) > 15).length);
    const summary = await page
      .locator('[data-testid="workspace-team-summary"]')
      .textContent()
      .catch(() => "");
    teamUiDetails = { panelVisible, agentCards, answersWithText, summaryLength: summary?.length ?? 0 };
    teamUiOk = panelVisible && agentCards >= 2 && (summary?.trim().length ?? 0) > 20;
    await page.screenshot({ path: path.join(OUT, "02-team-answers-panel.png"), fullPage: false });
  } catch (e) {
    teamUiDetails = { error: e instanceof Error ? e.message : String(e) };
    await page.screenshot({ path: path.join(OUT, "02-team-failed.png"), fullPage: false });
  }

  await browser.close();

  const serverLogs = extractServerLogs(logStart, serverLog);
  fs.writeFileSync(path.join(OUT, "server-logs.txt"), serverLogs.join("\n"));

  const fallbackLogs = serverLogs.filter(
    (l) => l.includes("[openrouter]") || l.includes("[gemini]"),
  );
  const hadFallback = fallbackLogs.some((l) => l.includes("auto-fallback"));
  const hadModelFailure = fallbackLogs.some((l) => l.includes("failed ("));

  const report = {
    step: "council-team-live-gemini-fix",
    timestamp: new Date().toISOString(),
    pass:
      councilApiOk &&
      teamApiOk &&
      councilUiOk &&
      teamUiOk,
    checks: {
      council_api: {
        ok: councilApiOk,
        httpStatus: councilRes.status,
        successCount: councilSuccess.length,
        invokedCount: councilData.council?.invokedCount,
        agents: councilAgents.map((a) => ({
          slug: a.slug,
          status: a.status,
          answerPreview: a.answer?.slice(0, 120),
          error: a.error,
        })),
        reportBlocks: councilReportBlocks,
      },
      team_api: {
        ok: teamApiOk,
        httpStatus: teamRes.status,
        successCount: teamSuccess.length,
        invokedCount: teamData.team?.invokedCount,
        partial: teamData.team?.partial,
        agents: teamAgents.map((a) => ({
          slug: a.slug,
          status: a.status,
          answerPreview: a.answer?.slice(0, 120),
          error: a.error,
        })),
        summaryPreview: teamData.team?.summary?.slice(0, 200),
      },
      council_ui: { ok: councilUiOk, details: councilUiDetails, screenshot: "01-council-report-panel.png" },
      team_ui: { ok: teamUiOk, details: teamUiDetails, screenshot: "02-team-answers-panel.png" },
      openrouter_fallback: {
        hadModelFailure,
        hadAutoFallback: hadFallback,
        logLines: fallbackLogs,
        note: hadFallback
          ? "Auto-fallback fired — see server-logs.txt"
          : hadModelFailure
            ? "Model failures logged but no fallback line captured"
            : "All primaries succeeded without fallback",
      },
    },
    serverLogSource: serverLog,
    serverLogLineFrom: logStart,
    artifacts: [
      "council-api-response.json",
      "team-api-response.json",
      "server-logs.txt",
      "01-council-report-panel.png",
      "02-team-answers-panel.png",
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
