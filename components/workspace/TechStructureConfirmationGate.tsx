"use client";

type TechStructureConfirmationGateProps = {
  open: boolean;
  planSummary: string;
  actionLines: string[];
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TechStructureConfirmationGate({
  open,
  planSummary,
  actionLines,
  confirmDisabled,
  onCancel,
  onConfirm,
}: TechStructureConfirmationGateProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tech-structure-gate-title"
      data-testid="workspace-tech-structure-confirmation-gate"
    >
      <div className="w-full max-w-lg rounded-lg border border-violet-700/60 bg-stone-900 p-5 shadow-xl">
        <h3 id="tech-structure-gate-title" className="text-base font-semibold text-violet-200">
          Подтверждение изменений
        </h3>
        <p className="mt-2 text-sm text-stone-300">
          Технический отдел предлагает изменить структуру системы. Без подтверждения записи в базу не
          создаются.
        </p>
        <p className="mt-3 text-sm text-stone-200 whitespace-pre-wrap">{planSummary}</p>
        {actionLines.length > 0 ? (
          <ul className="mt-3 max-h-40 overflow-y-auto space-y-1 text-xs text-stone-400">
            {actionLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-testid="workspace-tech-structure-gate-cancel"
            onClick={onCancel}
            className="rounded border border-stone-600 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-800"
          >
            Отмена
          </button>
          <button
            type="button"
            data-testid="workspace-tech-structure-gate-confirm"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-stone-50 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Выполнить
          </button>
        </div>
      </div>
    </div>
  );
}
