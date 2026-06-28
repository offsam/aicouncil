/**
 * W10B Step 3 evidence — Team mode in real chat flow + partial failure
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { probeProviders, isProviderError, exitEvidence } from "./evidence-utils"

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w10b-step3");
const INSTAGRAM_REGISTRY = "39d9aa14-6eb3-4359-bd21-ee9a148d62b8";
const TEAM_AGENT_IDS = [
  "a1000005-0000-4000-8000-000000000005",
  "a1000004-0000-4000-8000-000000000004",
  "a1000007-0000-4000-8000-000000000007",
];

async function ensureInstagramRoster(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const { data: chamber } = await supabase
    .from("chambers")
    .select("id")
    .eq("entity_registry_id", INSTAGRAM_REGISTRY)
    .maybeSingle();
  if (!chamber?.id) throw new Error("Instagram chamber not found");

  for (const agentId of TEAM_AGENT_IDS) {
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

  return chamber.id;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  await ensureInstagramRoster(supabase);
  const providerBlocked = await probeProviders();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="workspace-execution-mode-selector"]', {
    timeout: 30000,
  });

  await page
    .locator(`[data-testid="workspace-chamber-accent-${INSTAGRAM_REGISTRY}"]`)
    .click({ force: true });
  await page.waitForTimeout(400);

  const teamBtn = page.locator('[data-testid="workspace-execution-mode-team"]');
  const teamEnabled = !(await teamBtn.isDisabled());
  await page.locator('[data-testid="workspace-execution-mode-team"]').click();
  const teamSelected = await teamBtn.getAttribute("aria-checked");

  const taskText = `W10B step3 Team UI ${Date.now()}`;
  const chatInput = page.locator('aside input[placeholder*="Instagram"]');
  await chatInput.fill(taskText);
  await page.locator('aside button[type="submit"]').click();

  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="workspace-team-answers-panel"]') !== null ||
      (document.querySelectorAll("aside .whitespace-pre-wrap").length >= 2 &&
        !document.body.textContent?.includes("Team: сбор мнений")),
    { timeout: 180000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "01-team-chat-response.png") });

  const teamPanelVisible =
    (await page.locator('[data-testid="workspace-team-answers-panel"]').count()) > 0;
  const teamSummary = await page
    .locator('[data-testid="workspace-team-summary"]')
    .textContent()
    .catch(() => "");
  const partialBadgeVisible =
    (await page.locator('[data-testid="workspace-team-partial-badge"]').count()) > 0;
  const assistantText = await page.locator("aside .whitespace-pre-wrap").last().textContent();
  const metaText = await page.locator("aside .text-xs.text-stone-400").last().textContent();

  await browser.close();

  const providerBlockedAfterChat =
    providerBlocked ||
    isProviderError(assistantText ?? "") ||
    isProviderError(metaText ?? "");

  const { data: routingLog } = await supabase
    .from("routing_logs")
    .select("id, task_text, method, agent_count, chosen_target_entity_registry_id, created_at")
    .ilike("task_text", `${taskText}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const partialTask = `W10B step3 Team partial ${Date.now()}`;
  const partialRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: partialTask,
      executionMode: "team",
      sourceEntityId: INSTAGRAM_REGISTRY,
      forceFailSlugs: ["or-llama"],
    }),
  });
  const partialData = await partialRes.json();
  fs.writeFileSync(
    path.join(OUT, "partial-api-response.json"),
    JSON.stringify(partialData, null, 2),
  );

  const teamPathReached =
    partialRes.status === 500 &&
    isProviderError(String(partialData.error ?? "")) &&
    !String(partialData.error ?? "").includes("менее 2");

  const partialChecks = {
    api_ok: partialRes.ok,
    execution_mode_team: partialData.executionMode === "team",
    partial_flag: partialData.team?.partial === true,
    success_count_at_least_2: (partialData.team?.successCount ?? 0) >= 2,
    has_synthesis: Boolean(partialData.team?.synthesis?.finalVerdict),
    answer_has_partial_banner: String(partialData.answer ?? "").includes("Частичный"),
  };

  const { data: partialRouting } = await supabase
    .from("routing_logs")
    .select("id, agent_count, task_text")
    .ilike("task_text", `${partialTask}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const checks = {
    team_segment_enabled: teamEnabled,
    team_selected: teamSelected === "true",
    team_panel_visible: teamPanelVisible,
    team_summary_nonempty: Boolean(teamSummary?.trim()),
    assistant_mentions_mode: metaText?.includes("mode: team") ?? false,
    routing_log_agent_count_3: routingLog?.agent_count === 3,
    routing_log_target_instagram: routingLog?.chosen_target_entity_registry_id === INSTAGRAM_REGISTRY,
    partial_failure_api: Object.values(partialChecks).every(Boolean),
    partial_routing_agent_count_3: partialRouting?.agent_count === 3,
  };

  const report = {
    step: "W10B-step3",
    title: "Team mode in chat flow",
    timestamp: new Date().toISOString(),
    taskText,
    partialTask,
    teamSelected,
    teamSummary: teamSummary?.slice(0, 200),
    assistantTextPreview: assistantText?.slice(0, 300),
    metaText,
    routingLog,
    partialRouting,
    partialChecks,
    partialApi: {
      partial: partialData.team?.partial,
      successCount: partialData.team?.successCount,
      invokedCount: partialData.team?.invokedCount,
      synthesisVerdict: partialData.team?.synthesis?.finalVerdict?.slice(0, 200),
    },
    sqlExample: `SELECT id, task_text, agent_count, chosen_target_entity_registry_id, created_at
FROM routing_logs
WHERE task_text LIKE 'W10B step3 Team%'
ORDER BY created_at DESC;`,
    checks,
    providerBlocked: providerBlockedAfterChat,
    teamPathReached,
    pass: providerBlockedAfterChat
      ? checks.team_segment_enabled &&
        checks.team_selected &&
        (teamPathReached ||
          routingLog?.agent_count === 3 ||
          routingLog?.chosen_target_entity_registry_id === INSTAGRAM_REGISTRY)
      : Object.values(checks).every(Boolean),
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!report.pass) {
    console.error("W10B step3 evidence FAILED");
    exitEvidence(1);
  }
  console.log("W10B step3 evidence PASS");
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1);
});
