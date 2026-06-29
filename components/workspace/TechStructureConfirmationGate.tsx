"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type TechStructureConfirmationGateProps = {
  open: boolean;
  planSummary: string;
  actionLines: string[];
  impactLines?: string[];
  snapshotId?: string;
  /** Destructive plan — warning styling, delete confirm label (execution enabled TD-03C). */
  isDestructive?: boolean;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TechStructureConfirmationGate({
  open,
  planSummary,
  actionLines,
  impactLines = [],
  snapshotId,
  isDestructive,
  confirmDisabled,
  onCancel,
  onConfirm,
}: TechStructureConfirmationGateProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const destructive = isDestructive === true;
  const confirmLabel = destructive ? "Выполнить удаление" : "Выполнить";

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tech-structure-gate-title"
      data-testid="workspace-tech-structure-confirmation-gate"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-violet-600/50 bg-stone-950 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <h3 id="tech-structure-gate-title" className="text-base font-semibold text-violet-200">
            {destructive ? "План удаления" : "Подтверждение изменений"}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-400">
            {destructive
              ? "Технический отдел подготовил план удаления с анализом последствий. Подтвердите выполнение."
              : "Технический отдел предлагает изменить структуру системы. Без подтверждения записи в базу не создаются."}
          </p>
          {planSummary.trim() ? (
            <p className="mt-3 rounded-lg border border-stone-800 bg-stone-900/80 px-3 py-2 text-sm leading-relaxed text-stone-200 whitespace-pre-wrap">
              {planSummary}
            </p>
          ) : null}
          {actionLines.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Шаги плана</p>
              <ol className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-stone-800 bg-stone-900/60 px-3 py-2 text-xs text-stone-300">
                {actionLines.map((line, i) => (
                  <li key={i} className="leading-relaxed">
                    {line}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {impactLines.length > 0 ? (
            <div className="mt-3" data-testid="workspace-tech-structure-gate-impact">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-400/90">
                Анализ последствий (каскад)
              </p>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
                {impactLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {snapshotId ? (
            <p
              className="mt-3 text-xs text-stone-500 font-mono"
              data-testid="workspace-tech-structure-gate-snapshot-id"
            >
              Before-snapshot: {snapshotId}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-stone-800 bg-stone-950 px-5 py-4">
          <button
            type="button"
            data-testid="workspace-tech-structure-gate-cancel"
            onClick={onCancel}
            className="rounded-lg border border-stone-600 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-800"
          >
            Отмена
          </button>
          <button
            type="button"
            data-testid="workspace-tech-structure-gate-confirm"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-stone-50 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
