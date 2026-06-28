/**
 * W16 evidence — double-click opens modal inspector with agent stats/history
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w16-inspector-dblclick");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: chamber } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id")
    .eq("name", "Instagram")
    .maybeSingle();
  if (!chamber?.entity_registry_id) throw new Error("Instagram chamber not found");

  const { data: assignment } = await supabase
    .from("agent_assignments")
    .select("id, agent_id, agents(id, name, provider, model_id)")
    .eq("chamber_id", chamber.id)
    .limit(1)
    .maybeSingle();
  if (!assignment?.agent_id) throw new Error("No agent assignment on Instagram");

  const agentRow = Array.isArray(assignment.agents) ? assignment.agents[0] : assignment.agents;
  const chamberName = chamber.name;

  const { count: logCount } = await supabase
    .from("request_logs")
    .select("id", { count: "exact", head: true })
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .eq("agent_id", assignment.agent_id);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".react-flow", { timeout: 30000 });

  await page.evaluate((registryId) => {
    const rf = document.querySelector(".react-flow") as HTMLElement & {
      __rf?: { fitView?: (opts?: object) => void };
    };
    void registryId;
    const fitBtn = document.querySelector(".react-flow__controls-fitview") as HTMLButtonElement | null;
    fitBtn?.click();
  }, chamber.entity_registry_id);

  await page.waitForTimeout(600);

  const agentNode = page.locator(`[data-testid="workspace-agent-${assignment.id}"]`);
  await agentNode.waitFor({ state: "attached", timeout: 30000 });

  await page.screenshot({ path: path.join(OUT, "01-before-dblclick.png") });

  await agentNode.dblclick({ force: true });

  await page.waitForSelector('[data-testid="workspace-inspector"]', { timeout: 10000 });
  await page.waitForSelector('[data-testid="workspace-inspector-kind-agent"]', { timeout: 10000 });
  await page.waitForSelector('[data-testid="workspace-inspector-stats"]', { timeout: 15000 });

  const inspectorVisible = (await page.locator('[data-testid="workspace-inspector"]').count()) > 0;
  const statsVisible = (await page.locator('[data-testid="workspace-inspector-stats"]').count()) > 0;
  const providerText = await page.locator('[data-testid="workspace-inspector"]').innerText();
  const hasProvider = agentRow?.provider ? providerText.includes(agentRow.provider) : true;
  const hasModel = agentRow?.model_id ? providerText.includes(agentRow.model_id) : true;

  await page.screenshot({ path: path.join(OUT, "02-agent-inspector-modal.png"), fullPage: false });

  await page.locator('[data-testid="workspace-inspector-deep-toggle"]').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "03-agent-inspector-deep.png") });

  const report = {
    assignmentId: assignment.id,
    agentId: assignment.agent_id,
    agentName: agentRow?.name ?? null,
    chamberName,
    provider: agentRow?.provider ?? null,
    model: agentRow?.model_id ?? null,
    dbRequestLogCount: logCount ?? 0,
    inspectorVisible,
    statsVisible,
    hasProvider,
    hasModel,
    screenshots: [
      "docs/evidence/w16-inspector-dblclick/01-before-dblclick.png",
      "docs/evidence/w16-inspector-dblclick/02-agent-inspector-modal.png",
      "docs/evidence/w16-inspector-dblclick/03-agent-inspector-deep.png",
    ],
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

  await browser.close();

  const ok = inspectorVisible && statsVisible && hasProvider && hasModel;
  console.log(JSON.stringify(report, null, 2));
  exitEvidence(ok ? 0 : 1, ok ? "w16 inspector dblclick OK" : "w16 inspector dblclick FAILED");
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1, String(err));
});
