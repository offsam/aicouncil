"use client";

import type {
  ExecutionAgentSlot,
  ExecutionProgressState,
} from "@/lib/workspace/execution-progress";
import { deriveExecutionResultFromProgress } from "@/lib/workspace/execution-result-status";
import { ExecutionResultBanner } from "./ExecutionResultBanner";

function bulbClass(status: ExecutionAgentSlot["status"], active: boolean): string {
  if (status === "working" || (status === "pending" && active)) {
    return "workspace-exec-bulb workspace-exec-bulb--working";
  }
  if (status === "done") return "workspace-exec-bulb workspace-exec-bulb--done";
  if (status === "error") return "workspace-exec-bulb workspace-exec-bulb--error";
  return "workspace-exec-bulb workspace-exec-bulb--idle";
}

export function ChatExecutionProgress({
  progress,
  selectedAgentId,
  onSelectAgent,
}: {
  progress: ExecutionProgressState;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}) {
  const selected =
    progress.agents.find((a) => a.agentId === selectedAgentId) ?? null;
  const activeIndex = progress.activeAgentIndex ?? 0;

  const resultStatus =
    progress.resultStatus ?? deriveExecutionResultFromProgress(progress);
  const showResultBanner =
    resultStatus &&
    (progress.phase === "complete" || progress.phase === "error");

  const phaseLabel =
    progress.phase === "routing"
      ? "Маршрутизация…"
      : progress.phase === "executing"
        ? progress.currentStepLabel ?? "Агенты работают…"
        : showResultBanner && resultStatus
          ? resultStatus.title
          : progress.phase === "complete"
            ? progress.currentStepLabel ?? "Готово"
            : "Ошибка";

  return (
    <div
      data-testid="workspace-chat-execution-progress"
      className="border-b border-stone-800 bg-stone-950/90 px-4 py-3"
    >
      {showResultBanner && (
        <div className="mb-3">
          <ExecutionResultBanner status={resultStatus} compact />
        </div>
      )}

      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-stone-300">{phaseLabel}</p>
        <span className="text-[10px] uppercase tracking-wide text-stone-500">
          {progress.mode}
        </span>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="list"
        aria-label="Агенты в работе"
      >
        {progress.agents.map((agent, index) => {
          const isActive =
            progress.phase === "executing" &&
            (agent.status === "working" || index === activeIndex);
          const picked = selectedAgentId === agent.agentId;
          return (
            <button
              key={agent.agentId}
              type="button"
              role="listitem"
              data-testid={`workspace-exec-bulb-${agent.slug}`}
              title={agent.agentName}
              aria-pressed={picked}
              onClick={() => onSelectAgent(picked ? null : agent.agentId)}
              className={`group flex flex-col items-center gap-1 rounded px-1 py-0.5 transition ${
                picked ? "bg-stone-800/80" : "hover:bg-stone-800/40"
              }`}
            >
              <span
                className={bulbClass(agent.status, isActive)}
                aria-hidden
              />
              <span className="max-w-[4.5rem] truncate text-[9px] text-stone-400 group-hover:text-stone-300">
                {agent.agentName}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          data-testid="workspace-exec-bulb-detail"
          className="mt-3 rounded border border-stone-700 bg-stone-900/80 px-3 py-2 text-xs"
        >
          <div className="mb-1 font-semibold text-stone-200">{selected.agentName}</div>
          {selected.stepLabel && (
            <div className="mb-1 text-stone-500">Шаг: {selected.stepLabel}</div>
          )}
          {selected.status === "working" || selected.status === "pending" ? (
            <div className="text-stone-400">Ожидание ответа…</div>
          ) : selected.status === "error" ? (
            <div className="whitespace-pre-wrap text-red-300">
              {selected.error ?? "Ошибка вызова"}
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-stone-200">
              {selected.answer ?? "(нет текста ответа)"}
            </div>
          )}
          {selected.latencyMs != null && selected.status === "done" && (
            <div className="mt-1 text-[10px] text-stone-500">
              {selected.latencyMs} ms
            </div>
          )}
        </div>
      )}
    </div>
  );
}
