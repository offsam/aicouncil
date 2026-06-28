"use client";

import type { CostTier } from "@/lib/cost-tier";
import {
  buildDebateTierOptions,
  debateOptionEligible,
} from "@/lib/debate/debate-tier-options";
import type { DebateTierMode } from "@/lib/debate/types";
import type { CityHallDebateChambersByTier } from "@/lib/workspace/resolve-city-hall-council-chamber";

type DebateTierPickerProps = {
  open: boolean;
  taskPreview: string;
  debateChambersByTier: CityHallDebateChambersByTier;
  tierCounts: Record<CostTier, number>;
  onCancel: () => void;
  onConfirm: (tierMode: DebateTierMode) => void;
};

export function DebateTierPicker({
  open,
  taskPreview,
  debateChambersByTier,
  tierCounts,
  onCancel,
  onConfirm,
}: DebateTierPickerProps) {
  if (!open) return null;

  const options = buildDebateTierOptions(debateChambersByTier);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="debate-picker-title"
      data-testid="workspace-debate-tier-picker"
    >
      <div className="w-full max-w-lg rounded-lg border border-violet-700/60 bg-stone-900 p-5 shadow-xl">
        <h3 id="debate-picker-title" className="text-base font-semibold text-violet-200">
          Спор между агентами
        </h3>
        <p className="mt-2 text-sm text-stone-300">
          Выберите уровень — спорят только два агента из соответствующего отдела City Hall.
          Цепочка confirm/revise, до 3 критических правок каждому.
        </p>
        <p className="mt-3 text-xs text-stone-400 line-clamp-2">{taskPreview}</p>

        <div className="mt-4">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Уровень спора
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.map((option) => {
              const eligible = debateOptionEligible(option, tierCounts);
              return (
                <button
                  key={option.tier}
                  type="button"
                  disabled={!eligible}
                  data-testid={`workspace-debate-tier-${option.tier}`}
                  onClick={() => onConfirm(option.tierMode)}
                  className={`workspace-debate-tier-btn${
                    eligible ? "" : " workspace-debate-tier-btn--disabled"
                  }`}
                  title={option.hint}
                >
                  <span className="workspace-debate-tier-btn__label">{option.label}</span>
                  <span className="workspace-debate-tier-btn__hint">
                    {option.chamberLabel} · {tierCounts[option.tier]} аг.
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-testid="workspace-debate-picker-cancel"
            onClick={onCancel}
            className="rounded border border-stone-600 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-800"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
