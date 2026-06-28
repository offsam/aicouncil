"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Clock, ListOrdered, RotateCcw } from "lucide-react";
import { FeedbackBar } from "./FeedbackBar";
import { ExecutionResultBanner } from "@/components/workspace/ExecutionResultBanner";
import {
  readWorkspacePendingWorkflow,
  workflowPhaseFromStatus,
  workflowStepsFromApi,
  writeWorkspacePendingWorkflow,
} from "@/lib/mission-workspace-bridge";
import { deriveWorkflowExecutionResult } from "@/lib/workspace/execution-result-status";

type WorkflowStatus = "pending" | "in_progress" | "completed" | "failed";
type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

export interface WorkflowSummary {
  id: string;
  task_text: string;
  status: WorkflowStatus;
  final_output: string | null;
  created_at: string;
  completed_at: string | null;
  outcome?: string;
  outcome_reason?: string | null;
}

export interface WorkflowStepDetail {
  id: string;
  step_order: number;
  status: StepStatus;
  input_summary: string | null;
  output_summary: string | null;
  output_full: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  target_chamber?: { id: string; name: string } | null;
  assigned_agent?: { id: string; name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-500/20 text-slate-400",
  in_progress: "bg-amber-500/20 text-amber-300",
  completed: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-red-500/20 text-red-300",
  skipped: "bg-slate-500/10 text-slate-500",
};

function formatDuration(started: string | null, completed: string | null): string {
  if (!started) return "—";
  const start = new Date(started).getTime();
  const end = completed ? new Date(completed).getTime() : Date.now();
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function StepRow({
  step,
  expanded,
  onToggle,
  onRetry,
  retrying,
}: {
  step: WorkflowStepDetail;
  expanded: boolean;
  onToggle: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const chamberName = step.target_chamber?.name ?? `Chamber ${step.step_order}`;
  const failed = step.status === "failed";

  return (
    <div
      className={`rounded-xl border ${failed ? "border-red-500/40 bg-red-500/5" : "border-theme-border bg-theme-surface/50"}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-theme-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-theme-muted" />
        )}
        <span className="text-xs font-mono text-theme-faint">#{step.step_order}</span>
        <span className="flex-1 text-sm font-medium text-theme-primary">{chamberName}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_COLORS[step.status] ?? STATUS_COLORS.pending}`}
        >
          {step.status}
        </span>
        <span className="flex items-center gap-1 text-xs text-theme-faint">
          <Clock className="h-3 w-3" />
          {formatDuration(step.started_at, step.completed_at)}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-theme-border"
          >
            <div className="space-y-3 px-4 py-3 text-sm">
              {step.assigned_agent?.name && (
                <p className="text-xs text-theme-muted">
                  Agent: <span className="text-theme-secondary">{step.assigned_agent.name}</span>
                </p>
              )}
              {step.input_summary && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-theme-faint">
                    Input
                  </p>
                  <p className="whitespace-pre-wrap text-theme-secondary">{step.input_summary}</p>
                </div>
              )}
              {step.output_summary && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-theme-faint">
                    Output
                  </p>
                  <p className="whitespace-pre-wrap text-theme-secondary">{step.output_summary}</p>
                </div>
              )}
              {failed && step.error_message && (
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-red-300">
                  {step.error_message}
                </div>
              )}
              {failed && onRetry && (
                <button
                  type="button"
                  data-testid={`workflow-retry-step-${step.step_order}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry();
                  }}
                  disabled={retrying}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
                  {retrying ? "Повтор…" : "Повторить шаг"}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface WorkflowPanelProps {
  workflowId: string | null;
  initialWorkflow?: WorkflowSummary | null;
  initialSteps?: WorkflowStepDetail[];
  onComplete?: (finalOutput: string) => void;
  /** Sync active workflow progress to Workspace canvas via localStorage bridge. */
  syncToWorkspace?: boolean;
  workspaceBridgeCreatedAt?: string;
}

export function WorkflowPanel({
  workflowId,
  initialWorkflow,
  initialSteps,
  onComplete,
  syncToWorkspace = false,
  workspaceBridgeCreatedAt,
}: WorkflowPanelProps) {
  const [recent, setRecent] = useState<WorkflowSummary[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowSummary | null>(initialWorkflow ?? null);
  const [steps, setSteps] = useState<WorkflowStepDetail[]>(initialSteps ?? []);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(workflowId);
  const [pollTick, setPollTick] = useState(0);
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null);
  const bridgeCreatedAtRef = useRef(workspaceBridgeCreatedAt ?? new Date().toISOString());
  const bridgeCompleteSentRef = useRef<string | null>(null);
  const lastBridgeFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (workspaceBridgeCreatedAt) {
      bridgeCreatedAtRef.current = workspaceBridgeCreatedAt;
    }
  }, [workspaceBridgeCreatedAt]);

  useEffect(() => {
    bridgeCompleteSentRef.current = null;
    lastBridgeFingerprintRef.current = null;
  }, [workflowId]);

  function workflowBridgeFingerprint(
    nextWorkflow: WorkflowSummary,
    nextSteps: WorkflowStepDetail[],
  ) {
    return `${nextWorkflow.id}:${nextWorkflow.status}:${nextSteps
      .map((s) => `${s.step_order}:${s.status}`)
      .join("|")}`;
  }

  function syncWorkflowBridge(nextWorkflow: WorkflowSummary, nextSteps: WorkflowStepDetail[]) {
    if (!syncToWorkspace || !nextSteps.length) return;

    const phase = workflowPhaseFromStatus(nextWorkflow.status);
    if (phase === "complete" && bridgeCompleteSentRef.current === nextWorkflow.id) {
      return;
    }

    const fingerprint = workflowBridgeFingerprint(nextWorkflow, nextSteps);
    if (lastBridgeFingerprintRef.current === fingerprint && phase !== "complete") {
      return;
    }
    lastBridgeFingerprintRef.current = fingerprint;

    const existing = readWorkspacePendingWorkflow();
    const createdAt =
      existing?.workflowId === nextWorkflow.id
        ? existing.createdAt
        : bridgeCreatedAtRef.current;

    writeWorkspacePendingWorkflow({
      source: "mission-control",
      createdAt,
      updatedAt: new Date().toISOString(),
      phase,
      workflowId: nextWorkflow.id,
      taskText: nextWorkflow.task_text,
      workflowStatus: nextWorkflow.status,
      steps: workflowStepsFromApi(nextSteps),
    });

    if (phase === "complete") {
      bridgeCompleteSentRef.current = nextWorkflow.id;
    }
  }

  useEffect(() => {
    fetch("/api/workflows")
      .then((r) => r.json())
      .then((data: { workflows?: WorkflowSummary[] }) => {
        setRecent(data.workflows ?? []);
      })
      .catch(() => {});
  }, [workflow?.status]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/workflows/${selectedId}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        workflow: WorkflowSummary;
        steps: WorkflowStepDetail[];
      };
      setWorkflow(data.workflow);
      setSteps(data.steps);
      syncWorkflowBridge(data.workflow, data.steps);

      if (
        data.workflow.status === "completed" &&
        data.workflow.final_output &&
        onComplete
      ) {
        onComplete(data.workflow.final_output);
      }

      if (data.workflow.status === "in_progress" || data.workflow.status === "pending") {
        window.setTimeout(poll, 2000);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [selectedId, onComplete, pollTick]);

  async function retryStep(stepId: string) {
    if (!selectedId || retryingStepId) return;
    setRetryingStepId(stepId);
    try {
      const res = await fetch(`/api/workflows/${selectedId}/retry-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId }),
      });
      const data = (await res.json()) as {
        workflow?: WorkflowSummary;
        steps?: WorkflowStepDetail[];
        error?: string;
      };
      if (!res.ok || !data.workflow || !data.steps) {
        console.error("[WorkflowPanel] retry failed:", data.error ?? res.status);
        return;
      }
      setWorkflow(data.workflow);
      setSteps(data.steps);
      syncWorkflowBridge(data.workflow, data.steps);
      setPollTick((t) => t + 1);
    } finally {
      setRetryingStepId(null);
    }
  }

  useEffect(() => {
    if (workflowId) setSelectedId(workflowId);
  }, [workflowId]);

  useEffect(() => {
    if (syncToWorkspace && workflow && steps.length && selectedId === workflow.id) {
      syncWorkflowBridge(workflow, steps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial seed only
  }, [syncToWorkspace, workflow?.id, steps.length, selectedId]);

  const active = workflow && selectedId === workflow.id ? workflow : null;
  const failedStep = steps.find((s) => s.status === "failed");
  const workflowResultStatus =
    active && steps.length
      ? deriveWorkflowExecutionResult(
          active.status,
          steps.map((s) => ({
            step_order: s.step_order,
            status: s.status,
            input_summary: s.input_summary,
            output_summary: s.output_summary,
            error_message: s.error_message,
            target_chamber: s.target_chamber
              ? { id: s.target_chamber.id, name: s.target_chamber.name, entity_type: "chamber" }
              : null,
            assigned_agent: s.assigned_agent
              ? { id: s.assigned_agent.id, name: s.assigned_agent.name }
              : null,
          })),
          active.final_output,
        )
      : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-6xl space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-5 w-5 text-teal-400" />
          <h2 className="text-lg font-semibold text-theme-primary">Workflows</h2>
        </div>
        {syncToWorkspace && active && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/workspace"
              className="inline-flex items-center rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-500/20 dark:text-amber-200"
            >
              Маршрут в Workspace →
            </Link>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recent.slice(0, 8).map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setSelectedId(w.id)}
              className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                selectedId === w.id
                  ? "border-teal-500/50 bg-teal-500/10"
                  : "border-theme-border hover:border-teal-500/30"
              }`}
            >
              <span
                className={`mr-2 inline-block rounded px-1 py-0.5 text-[9px] font-bold uppercase ${STATUS_COLORS[w.status]}`}
              >
                {w.status}
              </span>
              <span className="text-theme-secondary">{w.task_text.slice(0, 48)}…</span>
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="theme-panel-solid rounded-2xl p-5 shadow-lg">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-theme-faint">
                Active workflow
              </p>
              <p className="mt-1 text-sm text-theme-primary">{active.task_text}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${STATUS_COLORS[active.status]}`}
            >
              {active.status}
            </span>
          </div>

          {workflowResultStatus &&
            (active.status === "completed" || active.status === "failed") && (
            <div className="mb-4">
              <ExecutionResultBanner
                status={workflowResultStatus}
                onRetry={
                  failedStep ? () => retryStep(failedStep.id) : undefined
                }
                retrying={failedStep ? retryingStepId === failedStep.id : false}
              />
            </div>
          )}

          <div className="space-y-2">
            {steps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                expanded={expandedStep === step.step_order}
                onToggle={() =>
                  setExpandedStep((prev) => (prev === step.step_order ? null : step.step_order))
                }
                onRetry={step.status === "failed" ? () => retryStep(step.id) : undefined}
                retrying={retryingStepId === step.id}
              />
            ))}
          </div>

          {active.status === "completed" && active.final_output && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                Final output
              </p>
              <p className="whitespace-pre-wrap text-sm text-theme-secondary">{active.final_output}</p>
              {!active.outcome || active.outcome === "unrated" ? (
                <FeedbackBar
                  className="mt-4 border-t border-emerald-500/20 pt-4"
                  target={{ type: "workflow", id: active.id }}
                />
              ) : (
                <p className="mt-4 text-center text-xs text-theme-muted">
                  Оценка: {active.outcome}
                  {active.outcome_reason ? ` — ${active.outcome_reason}` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}
