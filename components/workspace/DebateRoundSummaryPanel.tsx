"use client";

import { useState } from "react";
import type { DebateRoundSummary } from "@/lib/debate/types";

const ACTION_LABEL: Record<string, string> = {
  initial: "Начальный ответ",
  confirm: "Подтверждение",
  critical_revision: "Критическая правка",
  accept: "Принято",
  counter_revision: "Парирование",
};

type DebateRoundSummaryPanelProps = {
  authorName: string;
  reviewerName: string;
  closedReason: "confirmed" | "attempts_exhausted";
  rounds: DebateRoundSummary[];
};

export function DebateRoundSummaryPanel({
  authorName,
  reviewerName,
  closedReason,
  rounds,
}: DebateRoundSummaryPanelProps) {
  const [open, setOpen] = useState(false);
  if (rounds.length === 0) return null;

  const closedLabel =
    closedReason === "confirmed"
      ? "Спор закрыт: подтверждение"
      : "Спор закрыт: попытки исчерпаны";

  return (
    <div className="workspace-debate-summary" data-testid="workspace-debate-summary">
      <div className="workspace-debate-summary__badge">
        Спор · {authorName} ↔ {reviewerName} · {closedLabel}
      </div>
      <button
        type="button"
        className="workspace-debate-summary__toggle"
        onClick={() => setOpen((v) => !v)}
        data-testid="workspace-debate-summary-toggle"
      >
        {open ? "Скрыть раунды" : `Показать раунды (${rounds.length})`}
      </button>
      {open && (
        <ol className="workspace-debate-summary__list">
          {rounds.map((round) => (
            <li key={round.roundIndex} className="workspace-debate-summary__round">
              <div className="workspace-debate-summary__round-head">
                <span>#{round.roundIndex + 1}</span>
                <span>{round.agentName}</span>
                <span>{ACTION_LABEL[round.action] ?? round.action}</span>
              </div>
              {round.criticalIssues && (
                <p className="workspace-debate-summary__issues">{round.criticalIssues}</p>
              )}
              {round.optionalNotes && (
                <p className="workspace-debate-summary__notes">{round.optionalNotes}</p>
              )}
              <p className="workspace-debate-summary__content">{round.content}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
