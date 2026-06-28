/**
 * Tech Department stats — Inspector panel + simulate fallback (no canvas polling).
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const TECH_BUILDING_ID = "a1000000-0000-4000-8000-000000000001";
const ROOT = path.join(process.cwd(), "docs/evidence/tech-department-stats");

async function openTechInspector(page: import("playwright").Page) {
  await page.evaluate((id) => {
    (window as unknown as { __workspaceSelectBuilding?: (id: string) => void }).__workspaceSelectBuilding?.(
      id,
    );
  }, TECH_BUILDING_ID);
  await page.waitForSelector('[data-testid="tech-dept-stats-refresh"]', { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="tech-dept-stat-deployed"]');
      const text = el?.textContent?.trim() ?? "";
      return text !== "" && text !== "…";
    },
    { timeout: 30000 },
  );
}

async function readSwitchCount(page: import("playwright").Page): Promise<number> {
  const text = await page.locator('[data-testid="tech-dept-stat-switches"]').innerText();
  return Number.parseInt(text.trim(), 10) || 0;
}

async function main() {
  fs.mkdirSync(ROOT, { recursive: true });

  const statsBeforeRes = await fetch(`${BASE}/api/tech-department/stats`);
  if (!statsBeforeRes.ok) throw new Error(`stats API ${statsBeforeRes.status}`);
  const statsBefore = (await statsBeforeRes.json()) as { fallbackSwitchesToday: number };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".workspace-flow", { timeout: 60000 });

  await page.evaluate((id) => {
    (window as unknown as { __workspaceSelectBuilding?: (id: string) => void }).__workspaceSelectBuilding?.(
      id,
    );
  }, TECH_BUILDING_ID);

  const building = page.locator(`.react-flow__node[data-id="${TECH_BUILDING_ID}"]`);
  await building.scrollIntoViewIfNeeded();
  await openTechInspector(page);

  const switchesBeforeUi = await readSwitchCount(page);
  await building.screenshot({ path: path.join(ROOT, "01-tech-dept-tile-quiet.png") });
  await page.screenshot({ path: path.join(ROOT, "02-inspector-stats-before.png") });

  const simRes = await fetch(`${BASE}/api/tech-department/simulate-fallback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerTag: "gemini",
      primaryModel: "gemini-2.5-flash",
      modelUsed: "gemini-2.5-flash-lite",
    }),
  });
  if (!simRes.ok) throw new Error(`simulate-fallback ${simRes.status}`);
  const simBody = (await simRes.json()) as {
    stats: { fallbackSwitchesToday: number; onFallbackAgents: number };
  };

  await page.getByTestId("tech-dept-stats-refresh").click();
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector('[data-testid="tech-dept-stat-switches"]');
      const n = Number.parseInt(el?.textContent?.trim() ?? "0", 10);
      return n >= expected;
    },
    simBody.stats.fallbackSwitchesToday,
    { timeout: 15000 },
  );

  const switchesAfterUi = await readSwitchCount(page);
  await page.screenshot({ path: path.join(ROOT, "03-inspector-stats-after-fallback.png") });

  await browser.close();

  const report = {
    capturedAt: new Date().toISOString(),
    apiSwitchesBefore: statsBefore.fallbackSwitchesToday,
    apiSwitchesAfterSimulate: simBody.stats.fallbackSwitchesToday,
    uiSwitchesBefore: switchesBeforeUi,
    uiSwitchesAfter: switchesAfterUi,
    onFallbackAgentsAfter: simBody.stats.onFallbackAgents,
    switchIncreased: switchesAfterUi > switchesBeforeUi,
    screenshots: [
      "01-tech-dept-tile-quiet.png",
      "02-inspector-stats-before.png",
      "03-inspector-stats-after-fallback.png",
    ],
  };

  fs.writeFileSync(path.join(ROOT, "evidence.json"), JSON.stringify(report, null, 2));

  if (!report.switchIncreased) {
    console.error("Switch counter did not increase in UI", report);
    exitEvidence(1, "Счётчик не вырос");
  }

  console.log(JSON.stringify(report, null, 2));
  exitEvidence(0, "Tech dept stats OK");
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1, "Tech dept stats failed");
});
