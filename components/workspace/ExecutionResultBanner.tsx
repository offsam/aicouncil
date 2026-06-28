"use client";

import type { ExecutionResultStatus } from "@/lib/workspace/execution-result-status";
import { executionResultTestId } from "@/lib/workspace/execution-result-status";

const BANNER_STYLES = {
  full_success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  partial_success: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  workflow_step_failed: "border-red-500/40 bg-red-500/10 text-red-100",
  full_failure: "border-red-500/40 bg-red-500/10 text-red-100",
} as const;

const TITLE_STYLES = {
  full_success: "text-emerald-300",
  partial_success: "text-amber-300",
  workflow_step_failed: "text-red-300",
  full_failure: "text-red-300",
} as const;

const ICON = {
  full_success: "✓",
  partial_success: "◐",
  workflow_step_failed: "⚠",
  full_failure: "✗",
} as const;

export function ExecutionResultBanner({
  status,
  compact,
  onRetry,
  retrying,
  className = "",
  dataTestId,
}: {
  status: ExecutionResultStatus;
  compact?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  dataTestId?: string;
}) {
  const { kind, title, detail, successCount, totalCount, failedItems, hasAnswer, workflowFailedStep, achievedSteps } =
    status;

  return (
    <div
      data-testid={dataTestId ?? executionResultTestId(kind)}
      className={`rounded border px-3 py-2 ${BANNER_STYLES[kind]} ${compact ? "text-[11px]" : "text-xs"} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${TITLE_STYLES[kind]}`} aria-hidden>
              {ICON[kind]}
            </span>
            <span className={`font-semibold ${TITLE_STYLES[kind]}`}>{title}</span>
            {successCount != null && totalCount != null && totalCount > 0 && (
              <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] opacity-90">
                {successCount}/{totalCount}
              </span>
            )}
          </div>
          {detail && <p className="mt-1 leading-relaxed opacity-90">{detail}</p>}

          {kind === "workflow_step_failed" && workflowFailedStep && (
            <p className="mt-1 text-[11px] opacity-90">
              Шаг {workflowFailedStep.order}: «{workflowFailedStep.label}»
              {workflowFailedStep.error ? ` — ${workflowFailedStep.error}` : ""}
            </p>
          )}

          {achievedSteps && achievedSteps.length > 0 && kind === "workflow_step_failed" && (
            <p className="mt-1 text-[11px] opacity-80">
              Выполнено:{" "}
              {achievedSteps.map((s) => `#${s.order} ${s.label}`).join(" · ")}
            </p>
          )}

          {failedItems && failedItems.length > 0 && kind !== "full_failure" && (
            <ul className="mt-2 space-y-0.5">
              {failedItems.map((item) => (
                <li key={item.label} className="flex flex-wrap gap-1 opacity-90">
                  <span className="font-medium">{item.label}</span>
                  {item.error && (
                    <span className="text-[10px] opacity-75">— {item.error}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {failedItems && failedItems.length > 0 && kind === "full_failure" && (
            <ul className="mt-2 space-y-0.5">
              {failedItems.map((item) => (
                <li key={item.label} className="opacity-90">
                  <span className="font-medium">{item.label}</span>
                  {item.error && (
                    <span className="text-[10px] opacity-75"> — {item.error}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {hasAnswer === false && kind !== "full_success" && (
            <p className="mt-1 text-[10px] opacity-75">Собранный ответ отсутствует.</p>
          )}
          {hasAnswer === true && (kind === "partial_success" || kind === "workflow_step_failed") && (
            <p className="mt-1 text-[10px] opacity-75">
              Доступен собранный ответ — см. ниже.
            </p>
          )}
        </div>

        {onRetry && kind === "workflow_step_failed" && (
          <button
            type="button"
            data-testid="workflow-retry-step-banner"
            onClick={onRetry}
            disabled={retrying}
            className="shrink-0 rounded border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-100 transition hover:bg-red-500/25 disabled:opacity-50"
          >
            {retrying ? "Повтор…" : "Повторить"}
          </button>
        )}
      </div>
    </div>
  );
}
