/**
 * W10B Step 2 evidence — server-side parallel orchestration (no UI)
 */
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { probeProviders, exitEvidence } from "./evidence-utils"

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w10b-step2");
const INSTAGRAM_CHAMBER = "39d9aa14-6eb3-4359-bd21-ee9a148d62b8";

type ParallelApiResult = {
  batchId: string;
  targetChamberRegistryId: string;
  requestedCount: number;
  invokedCount: number;
  wallTimeMs: number;
  agents: Array<{ slug: string; agentId: string }>;
  results: Array<{
    slug: string;
    status: string;
    latencyMs: number;
    startedAtMs: number;
    finishedAtMs: number;
    requestLogId?: string;
  }>;
  parallelProof: {
    sumLatencyMs: number;
    maxLatencyMs: number;
    startSpreadMs: number;
    wallTimeMs: number;
    isParallel: boolean;
  };
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const batchId = `w10b-step2-${Date.now()}`;
  const question = `W10B step2 parallel proof ${Date.now()}`;

  const res = await fetch(`${BASE}/api/dev/execute-parallel-agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetChamberRegistryId: INSTAGRAM_CHAMBER,
      question,
      agentCount: 3,
      batchId,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error("API error:", res.status, raw);
    exitEvidence(1);
  }

  const data = JSON.parse(raw) as ParallelApiResult;
  fs.writeFileSync(path.join(OUT, "api-response.json"), JSON.stringify(data, null, 2));

  const logPrefix = `[parallel:${batchId}]`;
  const { data: requestLogs, error: logError } = await supabase
    .from("request_logs")
    .select("id, agent_id, question, status, latency_ms, created_at")
    .like("question", `${logPrefix}%`)
    .order("created_at", { ascending: true });

  if (logError) {
    console.error("request_logs query failed:", logError.message);
    exitEvidence(1);
  }

  const distinctAgents = new Set((requestLogs ?? []).map((r) => r.agent_id));
  const logCountMatch = (requestLogs ?? []).length === data.invokedCount;
  const allTerminal = (requestLogs ?? []).every(
    (r) => r.status === "success" || r.status === "error",
  );
  const successCount = (requestLogs ?? []).filter((r) => r.status === "success").length;
  const providerBlocked = await probeProviders();

  const minStart = Math.min(...data.results.map((r) => r.startedAtMs));
  const maxStart = Math.max(...data.results.map((r) => r.startedAtMs));
  const concurrentStarts = maxStart - minStart < data.parallelProof.maxLatencyMs;

  const checks = {
    api_ok: res.ok,
    invoked_three_agents: data.invokedCount === 3,
    distinct_agent_slugs: new Set(data.results.map((r) => r.slug)).size === data.invokedCount,
    parallel_proof_flag: data.parallelProof.isParallel,
    wall_less_than_sum: data.wallTimeMs < data.parallelProof.sumLatencyMs,
    request_logs_count: logCountMatch,
    request_logs_distinct_agents: distinctAgents.size === data.invokedCount,
    request_logs_all_terminal: allTerminal,
    at_least_two_agent_success: successCount >= 2,
    concurrent_start_spread: concurrentStarts,
  };

  const sqlExample = `-- W10B step2 parallel batch
SELECT id, agent_id, status, latency_ms, left(question, 80) AS question_prefix, created_at
FROM request_logs
WHERE question LIKE '${logPrefix.replace(/'/g, "''")}%'
ORDER BY created_at ASC;`;

  const report = {
    step: "W10B-step2",
    title: "Server-side parallel orchestration",
    timestamp: new Date().toISOString(),
    targetChamberRegistryId: INSTAGRAM_CHAMBER,
    batchId,
    question,
    api: {
      endpoint: "/api/dev/execute-parallel-agents",
      wallTimeMs: data.wallTimeMs,
      parallelProof: data.parallelProof,
      agents: data.agents.map((a) => a.slug),
      results: data.results.map((r) => ({
        slug: r.slug,
        latencyMs: r.latencyMs,
        startedAtMs: r.startedAtMs,
        finishedAtMs: r.finishedAtMs,
        requestLogId: r.requestLogId,
      })),
    },
    requestLogs: requestLogs ?? [],
    sqlExample,
    notes: [
      "routing_logs не пишется на step 2 — parallel orchestrator логирует в request_logs (Mission Control pattern, server-side).",
      "parallelProof.isParallel: wallTimeMs < sumLatencyMs * 0.85 и startSpreadMs < maxLatencyMs * 0.5 при N>1.",
    ],
    checks,
    pass: providerBlocked
      ? checks.api_ok &&
        checks.invoked_three_agents &&
        checks.parallel_proof_flag &&
        checks.request_logs_count &&
        checks.request_logs_distinct_agents &&
        checks.request_logs_all_terminal &&
        checks.concurrent_start_spread
      : Object.values(checks).every(Boolean),
    providerBlocked,
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    console.error("W10B step2 evidence FAILED");
    exitEvidence(1);
  }
  console.log("W10B step2 evidence PASS");
}

main().catch((err) => {
  console.error(err);
  exitEvidence(1);
});
