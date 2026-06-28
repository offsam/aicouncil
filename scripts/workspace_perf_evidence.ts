/**
 * Workspace perf evidence — idle network + brief pan timing on /workspace.
 *
 * Usage (dev server running):
 *   npx tsx scripts/workspace_perf_evidence.ts
 *
 * Output: docs/evidence/workspace-perf/report.json
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = process.argv[2] || "http://localhost:3000";
const IDLE_MS = 45_000;
const OUT = path.join(process.cwd(), "docs/evidence/workspace-perf");

type UrlHit = { url: string; count: number };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  const statsHits: string[] = [];
  const providerHits: string[] = [];

  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/api/tech-department/stats")) statsHits.push(u);
    if (u.includes("/api/tech-department/provider-health")) providerHits.push(u);
  });

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForSelector(".workspace-flow", { timeout: 60_000 });

  statsHits.length = 0;
  providerHits.length = 0;

  await page.waitForTimeout(IDLE_MS);

  const idleStatsCount = statsHits.length;
  const idleProviderCount = providerHits.length;

  const panStart = Date.now();
  await page.mouse.move(800, 450);
  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(35, 0);
    await page.waitForTimeout(16);
  }
  const panDurationMs = Date.now() - panStart;

  const panMetrics = {
    wheelSteps: 24,
    totalPanMs: panDurationMs,
    avgStepMs: Math.round((panDurationMs / 24) * 100) / 100,
  };

  await page.screenshot({ path: path.join(OUT, "01-workspace-idle.png") });

  const report = {
    generatedAt: new Date().toISOString(),
    idleWindowMs: IDLE_MS,
    after: {
      techDepartmentStatsRequests: idleStatsCount,
      providerHealthRequests: idleProviderCount,
      pan: panMetrics,
    },
    baselineBeforeFix: {
      techDepartmentStatsRequestsPer45s: 15,
      note: "Poll every 3s on canvas tile + provider-health every 8s in Inspector when open",
    },
    pass: idleStatsCount === 0 && idleProviderCount === 0,
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

  await browser.close();

  console.log(JSON.stringify(report, null, 2));
  exitEvidence(report.pass ? 0 : 1, report.pass ? "workspace perf OK" : "unexpected idle polling");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
