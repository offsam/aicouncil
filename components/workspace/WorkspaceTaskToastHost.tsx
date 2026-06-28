"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExecutionResultBanner } from "@/components/workspace/ExecutionResultBanner";
import { useWorkspaceChat } from "@/components/workspace/WorkspaceChatContext";
import { useWorkspaceRoute } from "@/components/workspace/WorkspaceRouteContext";
import {
  deriveExecutionResultFromProgress,
  isTaskProblemStatus,
  type ExecutionResultStatus,
} from "@/lib/workspace/execution-result-status";

type TaskToastItem = {
  id: string;
  status: ExecutionResultStatus;
};

const AUTO_DISMISS_MS = 14_000;

function toastDedupeKey(
  taskText: string,
  phase: string,
  status: ExecutionResultStatus,
): string {
  return [
    taskText,
    phase,
    status.kind,
    status.detail ?? "",
    status.workflowFailedStep?.order ?? "",
    status.failedItems?.map((i) => `${i.label}:${i.error ?? ""}`).join("|") ?? "",
  ].join("::");
}

function TaskToastCard({
  status,
  onDismiss,
  onDetails,
}: {
  status: ExecutionResultStatus;
  onDismiss: () => void;
  onDetails: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="workspace-task-toast pointer-events-auto w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-[#0c1018]/95 shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur-md"
      role="alertdialog"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="workspace-task-toast"
    >
      <div className="border-b border-white/8 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
          Проблема при выполнении задачи
        </p>
      </div>
      <div className="p-3">
        <ExecutionResultBanner status={status} dataTestId="workspace-task-toast-banner" />
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            data-testid="workspace-task-toast-details"
            onClick={onDetails}
            className="rounded-lg border border-amber-400/35 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/25"
          >
            Подробнее в чате
          </button>
          <button
            type="button"
            data-testid="workspace-task-toast-dismiss"
            onClick={onDismiss}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-stone-300 transition hover:bg-white/10"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceTaskToastHost() {
  const { executionProgress } = useWorkspaceRoute();
  const { openDock, setExpanded } = useWorkspaceChat();
  const [toasts, setToasts] = useState<TaskToastItem[]>([]);
  const lastToastKeyRef = useRef<string | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const openDetails = useCallback(() => {
    openDock();
    setExpanded(true);
  }, [openDock, setExpanded]);

  useEffect(() => {
    if (executionProgress?.phase === "routing") {
      lastToastKeyRef.current = null;
    }
  }, [executionProgress?.phase]);

  useEffect(() => {
    if (!executionProgress) return;
    if (executionProgress.phase !== "complete" && executionProgress.phase !== "error") return;

    const status =
      executionProgress.resultStatus ?? deriveExecutionResultFromProgress(executionProgress);
    if (!status || !isTaskProblemStatus(status)) return;

    const key = toastDedupeKey(executionProgress.taskText, executionProgress.phase, status);
    if (lastToastKeyRef.current === key) return;
    lastToastKeyRef.current = key;

    setToasts((prev) => [
      ...prev.slice(-2),
      { id: `task-toast-${Date.now()}`, status },
    ]);
  }, [executionProgress]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="workspace-task-toast-host pointer-events-none fixed inset-x-0 top-[3.75rem] z-[220] flex flex-col items-center gap-2 px-4"
      data-testid="workspace-task-toast-host"
    >
      {toasts.map((toast) => (
        <TaskToastCard
          key={toast.id}
          status={toast.status}
          onDismiss={() => dismissToast(toast.id)}
          onDetails={() => {
            openDetails();
            dismissToast(toast.id);
          }}
        />
      ))}
    </div>
  );
}
