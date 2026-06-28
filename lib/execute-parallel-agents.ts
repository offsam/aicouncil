import { AI_COUNCIL_OFFICE_ID, resolveAgentDbId } from "./ai-council-ids";
import { selectAgentsForChamberEntity, type SelectedAgent } from "./agent-selection";
import { invokeAgentForWorkflow } from "./invoke-agent";
import { registrySlugToFrontendId } from "./route-agent-ids";
import { getSupabaseAdmin } from "./supabase/admin";

export type ParallelAgentInvokeResult = {
  agentId: string;
  slug: string;
  registryId: string;
  costTier: string;
  status: "success" | "error";
  answer?: string;
  error?: string;
  latencyMs: number;
  startedAtMs: number;
  finishedAtMs: number;
  requestLogId?: string;
};

export type ExecuteParallelAgentsParams = {
  targetChamberRegistryId: string;
  question: string;
  agentCount: number;
  agents?: SelectedAgent[];
  /** Correlates request_logs rows; embedded in question prefix when logging. */
  batchId?: string;
  logToRequestLogs?: boolean;
  /** Team/Council: only chamber roster, no city fallback. */
  rosterOnly?: boolean;
  /** Test hook: force specific slugs to fail. */
  forceFailSlugs?: string[];
  turbo?: boolean;
};

export type ExecuteParallelAgentsResult = {
  batchId: string;
  targetChamberRegistryId: string;
  requestedCount: number;
  invokedCount: number;
  wallTimeMs: number;
  agents: SelectedAgent[];
  results: ParallelAgentInvokeResult[];
  parallelProof: {
    sumLatencyMs: number;
    maxLatencyMs: number;
    startSpreadMs: number;
    wallTimeMs: number;
    /** True when N>1 and wall time is materially less than sum of latencies. */
    isParallel: boolean;
  };
};

function parallelQuestionPrefix(batchId: string): string {
  return `[parallel:${batchId}]`;
}

async function createPendingRequestLog(
  registrySlug: string,
  question: string,
): Promise<string | undefined> {
  const logSlug = registrySlugToFrontendId(registrySlug);
  const agentDbId = resolveAgentDbId(logSlug);
  if (!agentDbId) return undefined;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("request_logs")
    .insert({
      office_id: AI_COUNCIL_OFFICE_ID,
      agent_id: agentDbId,
      question,
      response: null,
      status: "pending",
      latency_ms: null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[executeParallelAgents] request_logs insert failed:", error.message);
    return undefined;
  }
  return data?.id;
}

async function finishRequestLog(
  logId: string,
  patch: {
    status: "success" | "error";
    response?: string;
    latency_ms: number;
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("request_logs")
    .update({
      status: patch.status,
      response: patch.response ?? null,
      latency_ms: patch.latency_ms,
    })
    .eq("id", logId);

  if (error) {
    console.error("[executeParallelAgents] request_logs update failed:", error.message);
  }
}

/**
 * Server-side parallel multi-agent invoke (Mission Control fan-out pattern, no browser).
 */
export async function executeParallelAgents(
  params: ExecuteParallelAgentsParams,
): Promise<ExecuteParallelAgentsResult> {
  const batchId = params.batchId ?? `batch-${Date.now()}`;
  const logQuestion = `${parallelQuestionPrefix(batchId)} ${params.question.trim()}`;
  const shouldLog = params.logToRequestLogs !== false;

  const agents =
    params.agents ??
    (await selectAgentsForChamberEntity(
      params.targetChamberRegistryId,
      params.agentCount,
      {
        rosterOnly: params.rosterOnly,
        turbo: params.turbo,
      },
    ));

  if (agents.length === 0) {
    throw new Error("No agents available for parallel execution");
  }

  const pendingLogIds = new Map<string, string>();
  if (shouldLog) {
    await Promise.all(
      agents.map(async (agent) => {
        const logId = await createPendingRequestLog(agent.slug, logQuestion);
        if (logId) pendingLogIds.set(agent.slug, logId);
      }),
    );
  }

  const wallStart = Date.now();

  const results = await Promise.all(
    agents.map(async (agent): Promise<ParallelAgentInvokeResult> => {
      const startedAtMs = Date.now();
      const forceError = params.forceFailSlugs?.includes(agent.slug) ?? false;
      try {
        const answer = await invokeAgentForWorkflow({
          agentSlug: agent.slug,
          agentRegistryId: agent.registryId,
          chamberRegistryId: params.targetChamberRegistryId,
          question: params.question,
          forceError,
        });
        const finishedAtMs = Date.now();
        const latencyMs = finishedAtMs - startedAtMs;
        const requestLogId = pendingLogIds.get(agent.slug);

        if (shouldLog && requestLogId) {
          await finishRequestLog(requestLogId, {
            status: "success",
            response: answer,
            latency_ms: latencyMs,
          });
        }

        return {
          agentId: agent.agentId,
          slug: agent.slug,
          registryId: agent.registryId,
          costTier: agent.costTier,
          status: "success",
          answer,
          latencyMs,
          startedAtMs,
          finishedAtMs,
          requestLogId,
        };
      } catch (err) {
        const finishedAtMs = Date.now();
        const latencyMs = finishedAtMs - startedAtMs;
        const errorMessage = err instanceof Error ? err.message : "Invoke failed";
        const requestLogId = pendingLogIds.get(agent.slug);

        if (shouldLog && requestLogId) {
          await finishRequestLog(requestLogId, {
            status: "error",
            response: errorMessage,
            latency_ms: latencyMs,
          });
        }

        return {
          agentId: agent.agentId,
          slug: agent.slug,
          registryId: agent.registryId,
          costTier: agent.costTier,
          status: "error",
          error: errorMessage,
          latencyMs,
          startedAtMs,
          finishedAtMs,
          requestLogId,
        };
      }
    }),
  );

  const wallTimeMs = Date.now() - wallStart;
  const sumLatencyMs = results.reduce((acc, r) => acc + r.latencyMs, 0);
  const maxLatencyMs = Math.max(...results.map((r) => r.latencyMs), 0);
  const starts = results.map((r) => r.startedAtMs);
  const startSpreadMs =
    starts.length > 1 ? Math.max(...starts) - Math.min(...starts) : 0;

  const isParallel =
    results.length > 1 &&
    sumLatencyMs > 0 &&
    wallTimeMs < sumLatencyMs * 0.85 &&
    startSpreadMs < maxLatencyMs * 0.5;

  console.info(
    `[executeParallelAgents] batch=${batchId} invoked=${results.length} wall=${wallTimeMs}ms sum=${sumLatencyMs}ms parallel=${isParallel}`,
  );

  return {
    batchId,
    targetChamberRegistryId: params.targetChamberRegistryId,
    requestedCount: params.agentCount,
    invokedCount: results.length,
    wallTimeMs,
    agents,
    results,
    parallelProof: {
      sumLatencyMs,
      maxLatencyMs,
      startSpreadMs,
      wallTimeMs,
      isParallel,
    },
  };
}

export { parallelQuestionPrefix };
