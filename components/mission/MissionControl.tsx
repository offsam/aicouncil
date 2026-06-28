"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AGENT_API_ROUTES } from "@/lib/agent-api";
import { AGENTS, type AgentId } from "@/lib/agents";
import { resolveAgentDbId } from "@/lib/ai-council-ids";
import type { AnalysisReport } from "@/lib/api-types";
import {
  writeWorkspacePendingRoute,
  workflowPhaseFromStatus,
  workflowStepsFromApi,
  writeWorkspacePendingWorkflow,
  type WorkspacePendingRouteAgent,
} from "@/lib/mission-workspace-bridge";
import { getRoutingSourceEntityId } from "@/lib/routing-source-storage";
import { formatTokens, sumTokens, type TokenUsage } from "@/lib/tokens";
import { AnalysisReportPanel } from "./AnalysisReportPanel";
import { AnalyzerHub, type AnalyzerPhase } from "./AnalyzerHub";
import { DataFlowCanvas } from "./DataFlowCanvas";
import { MissionDropZone, type UploadItem } from "./MissionDropZone";
import { ModelCard, type ModelCardStatus } from "./ModelCard";
import { WorkflowPanel, type WorkflowStepDetail, type WorkflowSummary } from "./WorkflowPanel";
import { FeedbackBar } from "./FeedbackBar";

const FLOW_MS = 900;

interface ModelRuntime {
  status: ModelCardStatus;
  latencyMs?: number;
  answer?: string;
  error?: string;
  tokens?: TokenUsage;
}

async function readFileAsBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const match = result.match(/^data:(.+);base64,(.+)$/);
      if (!match) {
        reject(new Error("Could not read image."));
        return;
      }
      resolve({ mediaType: match[1], base64: match[2] });
    };
    reader.onerror = () => reject(new Error("File read error."));
    reader.readAsDataURL(file);
  });
}

async function readTextFile(file: File): Promise<string> {
  return file.text();
}

async function fetchAnswer(
  url: string,
  payload: Record<string, string | undefined>,
): Promise<{ answer: string; usage?: TokenUsage }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as {
    answer?: string;
    usage?: TokenUsage;
    error?: string;
  };
  if (!response.ok || data.error) {
    throw new Error(data.error || "Unknown error");
  }
  return { answer: data.answer ?? "", usage: data.usage };
}

async function fetchReport(
  answers: Array<{ agent: string; answer: string }>,
): Promise<{ report: AnalysisReport; usage?: TokenUsage }> {
  const response = await fetch("/api/consensus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  const data = (await response.json()) as {
    report?: AnalysisReport;
    error?: string;
    usage?: TokenUsage;
  };
  if (!response.ok || data.error || !data.report) {
    throw new Error(data.error || "Analysis failed");
  }
  return { report: data.report, usage: data.usage };
}

function initialModels(): Partial<Record<AgentId, ModelRuntime>> {
  const map: Partial<Record<AgentId, ModelRuntime>> = {};
  for (const agent of AGENTS) {
    map[agent.id] = {
      status: agent.enabled ? "online" : "standby",
    };
  }
  return map;
}

function buildTokenLine(
  tokens: Partial<Record<AgentId | "consensus", TokenUsage>>,
): string {
  const parts: string[] = [];
  for (const agent of AGENTS) {
    const t = tokens[agent.id];
    if (t) parts.push(`${agent.name}: ${formatTokens(t.total)}`);
  }
  if (tokens.consensus) {
    parts.push(`Analyzer: ${formatTokens(tokens.consensus.total)}`);
  }
  const total = sumTokens(Object.values(tokens).filter(Boolean) as TokenUsage[]);
  if (parts.length) parts.push(`Total: ${formatTokens(total.total)}`);
  return parts.join(" · ");
}

export function MissionControl() {
  const [question, setQuestion] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [models, setModels] = useState(initialModels);
  const [flowingIds, setFlowingIds] = useState<AgentId[]>([]);
  const [phase, setPhase] = useState<AnalyzerPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Awaiting mission input");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [tokenUsage, setTokenUsage] = useState<
    Partial<Record<AgentId | "consensus", TokenUsage>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AgentId | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [workflowMode, setWorkflowMode] = useState(false);
  const [workflowLaunchMeta, setWorkflowLaunchMeta] = useState<{
    workflow: WorkflowSummary;
    steps: WorkflowStepDetail[];
    bridgeCreatedAt: string;
  } | null>(null);
  const [activeRoutingLogId, setActiveRoutingLogId] = useState<string | null>(null);

  const consensusStartedRef = useRef(false);
  const flowTimersRef = useRef<number[]>([]);
  const completedCountRef = useRef(0);
  const enabledCount = AGENTS.filter((a) => a.enabled).length;

  const tokenLine = useMemo(() => buildTokenLine(tokenUsage), [tokenUsage]);

  const modelStatusMap = useMemo(() => {
    const map: Partial<Record<AgentId, ModelCardStatus>> = {};
    for (const agent of AGENTS) {
      map[agent.id] = models[agent.id]?.status ?? "standby";
    }
    return map;
  }, [models]);

  function patchModel(id: AgentId, patch: Partial<ModelRuntime>) {
    setModels((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, ...patch },
    }));
  }

  function clearFlowTimers() {
    flowTimersRef.current.forEach((id) => window.clearTimeout(id));
    flowTimersRef.current = [];
  }

  function markComplete(id: AgentId, answer: string, latencyMs: number, tokens?: TokenUsage) {
    setFlowingIds((prev) => [...prev, id]);
    patchModel(id, { status: "processing", answer, latencyMs, tokens });
    if (tokens) setTokenUsage((prev) => ({ ...prev, [id]: tokens }));

    const timer = window.setTimeout(() => {
      patchModel(id, { status: "complete", answer, latencyMs, tokens });
      setFlowingIds((prev) => prev.filter((x) => x !== id));
      completedCountRef.current += 1;
      const pct = Math.min(
        85,
        Math.round((completedCountRef.current / enabledCount) * 85),
      );
      setProgress(pct);
    }, FLOW_MS);
    flowTimersRef.current.push(timer);
  }

  useEffect(() => {
    // Only check agents that were actually launched (status !== "standby")
    const activeAgents = AGENTS.filter((a) => a.enabled && models[a.id]?.status !== "standby");

    if (activeAgents.length === 0) return;

    const settled = activeAgents.every((a) => {
      const s = models[a.id]?.status;
      return s === "complete" || s === "error";
    });

    if (!settled || phase !== "collecting" || consensusStartedRef.current) return;

    const successes = activeAgents
      .filter((a) => models[a.id]?.status === "complete")
      .map((a) => ({
        agent: a.name,
        answer: models[a.id]?.answer ?? "",
      }));

    consensusStartedRef.current = true;

    // Single agent execution fallback (no consensus run needed)
    if (activeAgents.length === 1) {
      const singleSuccess = successes[0];
      if (singleSuccess) {
        setReport({
          consensus: singleSuccess.answer,
          differences: "Один агент. Анализ расхождений не требуется.",
          bestAnswer: `Ответ предоставлен моделью ${singleSuccess.agent}.`,
          finalVerdict: singleSuccess.answer,
        });
        setPhase("complete");
        setStatusText("Analysis complete (single agent)");
        setProgress(100);
      } else {
        setPhase("error");
        setStatusText("Model execution failed");
        setProgress(100);
      }
      setIsSubmitting(false);
      return;
    }

    if (successes.length < 2) {
      setPhase("error");
      setStatusText("Insufficient model responses");
      setProgress(100);
      setIsSubmitting(false);
      return;
    }

    setPhase("analyzing");
    setStatusText("Synthesizing verified conclusion");
    setProgress(92);

    fetchReport(successes)
      .then(({ report: r, usage }) => {
        setReport(r);
        setPhase("complete");
        setStatusText("Analysis complete");
        setProgress(100);
        if (usage) setTokenUsage((prev) => ({ ...prev, consensus: usage }));
      })
      .catch((err: Error) => {
        setPhase("error");
        setStatusText(err.message);
        setProgress(100);
      })
      .finally(() => setIsSubmitting(false));
  }, [models, phase, enabledCount]);

  async function buildPayload(): Promise<Record<string, string | undefined>> {
    let text = question.trim();
    const fileNotes: string[] = [];

    for (const item of uploads) {
      if (item.kind === "file" && item.file.type.startsWith("text/")) {
        try {
          const content = await readTextFile(item.file);
          fileNotes.push(`[File: ${item.file.name}]\n${content.slice(0, 4000)}`);
        } catch {
          fileNotes.push(`[File attached: ${item.file.name}]`);
        }
      } else if (item.kind === "file") {
        fileNotes.push(`[File attached: ${item.file.name}]`);
      }
    }

    if (fileNotes.length) {
      text = [text, ...fileNotes].filter(Boolean).join("\n\n");
    }

    const image = uploads.find((u) => u.kind === "image");
    let payload: Record<string, string | undefined> = {
      question: text || undefined,
    };

    if (image) {
      const { base64, mediaType } = await readFileAsBase64(image.file);
      payload = { ...payload, imageBase64: base64, imageMediaType: mediaType };
    }

    return payload;
  }

  async function handleLaunch() {
    const hasImage = uploads.some((u) => u.kind === "image");
    if (!question.trim() && !hasImage && uploads.length === 0) {
      alert("Enter a question or upload files.");
      return;
    }

    clearFlowTimers();
    consensusStartedRef.current = false;
    completedCountRef.current = 0;
    setIsSubmitting(true);
    setReport(null);
    setTokenUsage({});
    setFlowingIds([]);
    setPhase("collecting");
    setProgress(8);
    setStatusText("Routing and launching agents");
    setActiveWorkflowId(null);
    setWorkflowMode(false);
    setWorkflowLaunchMeta(null);
    setActiveRoutingLogId(null);

    let payload: Record<string, string | undefined>;
    try {
      payload = await buildPayload();
    } catch (err) {
      setPhase("error");
      setStatusText(err instanceof Error ? err.message : "Payload error");
      setIsSubmitting(false);
      return;
    }

    const attachedFile = uploads.find((u) => u.kind === "file");
    const fileExtension = attachedFile ? attachedFile.file.name.split(".").pop() : undefined;
    const sourceEntityId = getRoutingSourceEntityId();
    const taskText = (payload.question ?? question.trim()).trim();

    let routingResult: {
      mode?: "single" | "workflow";
      workflowId?: string;
      workflow?: WorkflowSummary;
      steps?: WorkflowStepDetail[];
      decision: {
        targets: Array<{ entityRegistryId: string; confidence: number; reason: string }>;
        method: "rule-based" | "llm-cheap" | "llm-expensive";
        agentCount: number;
        routingLogId?: string;
        usedConnectionId?: string;
        routeViaEntityId?: string;
        scoreDetail?: {
          matchedRules: string[];
          matchedKeywords: string[];
          llmReason: string | null;
        };
      };
      agentIds: string[];
    };

    try {
      const routeRes = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText,
          question: taskText,
          fileExtension: fileExtension,
          ...(sourceEntityId ? { sourceEntityId } : {}),
        }),
      });
      if (!routeRes.ok) throw new Error("Routing failed");
      routingResult = await routeRes.json();

      if (routingResult.mode === "workflow" && routingResult.workflowId) {
        const bridgeCreatedAt = new Date().toISOString();
        const wf = routingResult.workflow;
        const wfSteps = routingResult.steps ?? [];

        if (wf && wfSteps.length) {
          writeWorkspacePendingWorkflow({
            source: "mission-control",
            createdAt: bridgeCreatedAt,
            updatedAt: bridgeCreatedAt,
            phase: workflowPhaseFromStatus(wf.status),
            workflowId: routingResult.workflowId,
            taskText: wf.task_text,
            workflowStatus: wf.status,
            steps: workflowStepsFromApi(wfSteps),
          });
          setWorkflowLaunchMeta({ workflow: wf, steps: wfSteps, bridgeCreatedAt });
        }

        setWorkflowMode(true);
        setActiveWorkflowId(routingResult.workflowId);
        setPhase("analyzing");
        setStatusText("Multi-step workflow running across departments");
        setProgress(50);
        setIsSubmitting(false);
        return;
      }

      if (routingResult.decision.routingLogId) {
        setActiveRoutingLogId(routingResult.decision.routingLogId);
      }
    } catch (err) {
      console.warn("Routing failed, running all enabled agents:", err);
      routingResult = {
        decision: {
          targets: [{ entityRegistryId: "f47ac10b-58cc-4372-a567-0e02b2c3d479", confidence: 1.0, reason: "routing fallback" }],
          method: "rule-based",
          agentCount: AGENTS.filter((a) => a.enabled).length,
        },
        agentIds: AGENTS.filter((a) => a.enabled).map((a) => a.id),
      };
    }

    const activeAgentIds = routingResult.agentIds as AgentId[];
    const routingMsg = `Роутер: ${routingResult.decision.method}, запущено агентов: ${routingResult.decision.agentCount}`;
    setStatusText(`Council processing (${routingMsg})`);

    const thinking: Partial<Record<AgentId, ModelRuntime>> = {};
    for (const agent of AGENTS) {
      const isActive = agent.enabled && activeAgentIds.includes(agent.id);
      thinking[agent.id] = {
        status: isActive ? "processing" : "standby",
      };
    }
    setModels(thinking);

    const enabledAgents = AGENTS.filter((a) => a.enabled && activeAgentIds.includes(a.id));
    const targetEntityRegistryId =
      routingResult.decision.targets[0]?.entityRegistryId ??
      sourceEntityId ??
      "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    const missionStartedAt = new Date().toISOString();
    const missionAgentsState = new Map<string, WorkspacePendingRouteAgent>();

    for (const agent of enabledAgents) {
      const agentDbId = resolveAgentDbId(agent.id);
      if (!agentDbId) continue;
      missionAgentsState.set(agent.id, {
        agentDbId,
        slug: agent.id,
        status: "launched",
        agentName: agent.name,
      });
    }

    const syncMissionRoute = (phase: "running" | "complete") => {
      writeWorkspacePendingRoute({
        source: "mission-control",
        createdAt: missionStartedAt,
        updatedAt: new Date().toISOString(),
        phase,
        taskText,
        routing: {
          targetEntityRegistryId,
          routeViaEntityId: routingResult.decision.routeViaEntityId,
          usedConnectionId: routingResult.decision.usedConnectionId,
          method: routingResult.decision.method,
        },
        agents: Array.from(missionAgentsState.values()),
      });
    };

    syncMissionRoute("running");

    let logIdsBySlug: Record<string, string> = {};
    const contextFields: Record<string, string | undefined> = sourceEntityId
      ? { chamberRegistryId: sourceEntityId }
      : {};

    try {
      const startRes = await fetch("/api/request-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "start",
          question: payload.question ?? question.trim(),
          agent_slugs: enabledAgents.map((a) => a.id),
        }),
      });
      if (startRes.ok) {
        const startData = (await startRes.json()) as { logIds?: Record<string, string> };
        logIdsBySlug = startData.logIds ?? {};
      }
    } catch {
      /* logging is best-effort */
    }

    async function finishAgentLog(
      slug: string,
      patch: {
        status: "success" | "error";
        response?: string;
        latency_ms?: number;
      },
    ) {
      const logId = logIdsBySlug[slug];
      if (!logId) return;
      try {
        await fetch(`/api/request-logs/${logId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      } catch {
        /* logging is best-effort */
      }
    }

    const recordAgentResult = (agent: (typeof enabledAgents)[number], status: "success" | "error") => {
      const agentDbId = resolveAgentDbId(agent.id);
      if (!agentDbId) return;
      missionAgentsState.set(agent.id, {
        agentDbId,
        slug: agent.id,
        status,
        agentName: agent.name,
      });
      syncMissionRoute("running");
    };

    await Promise.all(
      enabledAgents.map(async (agent) => {
        const route = AGENT_API_ROUTES[agent.id];
        const started = performance.now();
        if (!route) {
          patchModel(agent.id, { status: "error", error: "Route missing" });
          recordAgentResult(agent, "error");
          await finishAgentLog(agent.id, {
            status: "error",
            latency_ms: Math.round(performance.now() - started),
          });
          return;
        }
        try {
          const agentPayload = agent.openRouterModel
            ? { question: payload.question, model: agent.openRouterModel, ...contextFields }
            : { ...payload, ...contextFields };
          const { answer, usage } = await fetchAnswer(route, agentPayload);
          const latencyMs = Math.round(performance.now() - started);
          markComplete(agent.id, answer, latencyMs, usage);
          recordAgentResult(agent, "success");
          await finishAgentLog(agent.id, {
            status: "success",
            response: answer,
            latency_ms: latencyMs,
          });
        } catch (err) {
          const latencyMs = Math.round(performance.now() - started);
          const errorMsg = err instanceof Error ? err.message : "Request failed";
          patchModel(agent.id, {
            status: "error",
            error: errorMsg,
            latencyMs,
          });
          recordAgentResult(agent, "error");
          await finishAgentLog(agent.id, {
            status: "error",
            response: errorMsg,
            latency_ms: latencyMs,
          });
          completedCountRef.current += 1;
        }
      }),
    );

    syncMissionRoute("complete");
  }

  useEffect(() => () => clearFlowTimers(), []);

  const selected = selectedModel ? models[selectedModel] : null;
  const selectedAgent = AGENTS.find((a) => a.id === selectedModel);

  return (
    <div className="relative min-h-screen overflow-hidden bg-app text-theme-primary">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-teal-500/[0.14] blur-3xl dark:bg-teal-500/[0.1]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-sky-400/[0.12] blur-3xl dark:bg-sky-400/[0.08]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-10 md:px-8 md:pt-14">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center md:mb-14"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-accent-label-muted">
            Mission Control
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-theme-primary md:text-5xl">
            AI Council
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-theme-muted md:text-base">
            Multiple AI models. One verified conclusion.
          </p>
          <Link
            href="/workspace"
            className="pointer-events-auto mt-5 inline-flex items-center rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-500/20 dark:text-amber-200"
          >
            Маршрут в Workspace →
          </Link>
        </motion.header>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {AGENTS.map((agent, index) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <ModelCard
                agent={agent}
                status={models[agent.id]?.status ?? "standby"}
                latencyMs={models[agent.id]?.latencyMs}
                tokens={models[agent.id]?.tokens}
                onClick={() => {
                  if (models[agent.id]?.answer || models[agent.id]?.error) {
                    setSelectedModel(agent.id);
                  }
                }}
              />
            </motion.div>
          ))}
        </section>

        <DataFlowCanvas modelStatus={modelStatusMap} flowingIds={flowingIds} />

        <div className="mb-12 mt-2">
          <AnalyzerHub phase={phase} progress={progress} statusText={statusText} />
        </div>

        <AnimatePresence>
          {report && !workflowMode && (
            <div className="mb-16">
              <AnalysisReportPanel report={report} tokenLine={tokenLine} />
              {phase === "complete" && (
                <FeedbackBar
                  className="mt-6"
                  target={activeRoutingLogId ? { type: "routing", id: activeRoutingLogId } : null}
                />
              )}
            </div>
          )}
        </AnimatePresence>

        {(workflowMode || activeWorkflowId) && (
          <div className="mb-12">
            <WorkflowPanel
              workflowId={activeWorkflowId}
              initialWorkflow={workflowLaunchMeta?.workflow}
              initialSteps={workflowLaunchMeta?.steps}
              syncToWorkspace={workflowMode}
              workspaceBridgeCreatedAt={workflowLaunchMeta?.bridgeCreatedAt}
              onComplete={(finalOutput) => {
                setReport({
                  consensus: finalOutput,
                  differences: "Multi-step workflow completed sequentially across departments.",
                  bestAnswer: finalOutput.slice(0, 500),
                  finalVerdict: finalOutput,
                });
                setPhase("complete");
                setStatusText("Workflow complete");
                setProgress(100);
              }}
            />
          </div>
        )}

        <MissionDropZone
          question={question}
          onQuestionChange={setQuestion}
          uploads={uploads}
          onUploadsChange={setUploads}
          onSubmit={handleLaunch}
          isSubmitting={isSubmitting}
        />
      </div>

      <AnimatePresence>
        {selected && selectedAgent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center theme-overlay p-4 backdrop-blur-sm"
            onClick={() => setSelectedModel(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="theme-panel-solid w-full max-w-lg rounded-3xl p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold" style={{ color: selectedAgent.color }}>
                  {selectedAgent.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedModel(null)}
                  className="text-theme-muted hover:text-theme-secondary"
                >
                  Close
                </button>
              </div>
              {selected.tokens && (
                <p className="mb-3 text-xs text-theme-faint">
                  {formatTokens(selected.tokens.input)} in · {formatTokens(selected.tokens.output)} out · {formatTokens(selected.tokens.total)} total
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-theme-secondary">
                {selected.error ?? selected.answer}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
