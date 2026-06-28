"use client";

type CouncilConfirmationGateProps = {
  open: boolean;
  chamberName: string;
  taskPreview: string;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  mode?: "team" | "council";
};

export function CouncilConfirmationGate({
  open,
  chamberName,
  taskPreview,
  confirmDisabled,
  onCancel,
  onConfirm,
  mode = "council",
}: CouncilConfirmationGateProps) {
  if (!open) return null;

  const isCouncil = mode === "council";
  const title = isCouncil ? "Заседание совета" : "Командная работа";
  const description = isCouncil
    ? "Council — режим максимального качества. Будет привлечён полный состав экспертов отдела и подготовлен структурированный отчёт."
    : "Team — сбалансированный режим. Будет привлечено несколько экспертов для совместного решения задачи.";
  const buttonText = isCouncil ? "Начать Council" : "Начать Team";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="council-gate-title"
      data-testid="workspace-council-confirmation-gate"
    >
      <div className="w-full max-w-md rounded-lg border border-amber-700/60 bg-stone-900 p-5 shadow-xl">
        <h3 id="council-gate-title" className="text-base font-semibold text-amber-200">
          {title}
        </h3>
        <p className="mt-2 text-sm text-stone-300">
          {description}
        </p>
        <p className="mt-3 text-xs text-stone-400 line-clamp-2">{taskPreview}</p>
        <ul className="mt-4 space-y-1 text-sm text-stone-300">
          <li>⏱ {isCouncil ? "~45 сек" : "~20-30 сек"}</li>
          <li>💰 {isCouncil ? "премиум-уровень ($$$)" : "оптимальный уровень ($$)"}</li>
          <li data-testid="workspace-council-gate-chamber">
            📍 Отдел: {chamberName}
          </li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-testid="workspace-council-gate-cancel"
            onClick={onCancel}
            className="rounded border border-stone-600 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-800"
          >
            Отмена
          </button>
          <button
            type="button"
            data-testid="workspace-council-gate-confirm"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-stone-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}
