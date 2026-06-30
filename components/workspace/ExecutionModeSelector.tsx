"use client";

import { EXECUTION_MODE_OPTIONS, type ExecutionMode } from "@/lib/execution-mode";

type ExecutionModeSelectorProps = {
  value: ExecutionMode;
  onChange: (mode: ExecutionMode) => void;
  teamDisabled: boolean;
  councilDisabled: boolean;
  turboDisabled?: boolean;
  teamDisabledReason?: string;
  councilDisabledReason?: string;
  turboDisabledReason?: string;
  compact?: boolean;
  layout?: "horizontal" | "sidebar" | "toolbar";
};

export function ExecutionModeSelector({
  value,
  onChange,
  teamDisabled,
  councilDisabled,
  turboDisabled = false,
  teamDisabledReason,
  councilDisabledReason,
  turboDisabledReason,
  compact,
  layout = "horizontal",
}: ExecutionModeSelectorProps) {
  const isToolbar = layout === "toolbar";

  return (
    <div
      role="radiogroup"
      aria-label="Execution mode"
      data-testid="workspace-execution-mode-selector"
      className={
        layout === "sidebar"
          ? "flex flex-col gap-0.5 rounded-lg border border-[var(--ws-panel-border)] bg-[var(--ws-panel-bg)] p-0.5"
          : isToolbar
            ? "inline-flex items-stretch gap-1 rounded-lg border border-[var(--ws-panel-border)] bg-[var(--ws-panel-bg)] p-1"
            : `grid grid-cols-4 gap-1 rounded-lg border border-[var(--ws-panel-border)] bg-[var(--ws-panel-bg)] p-1 ${
                compact ? "text-[10px]" : ""
              }`
      }
    >
      {EXECUTION_MODE_OPTIONS.map((option) => {
        const optionId = option.id as string;
        const selected = value === option.id;
        const disabled =
          (optionId === "team" && teamDisabled) ||
          (optionId === "council" && councilDisabled) ||
          (optionId === "turbo" && turboDisabled);
        const title =
          optionId === "team" && teamDisabled
            ? teamDisabledReason
            : optionId === "council" && councilDisabled
              ? councilDisabledReason
              : optionId === "turbo" && turboDisabled
                ? turboDisabledReason
                : option.hint;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={disabled}
            disabled={disabled}
            title={title}
            data-testid={`workspace-execution-mode-${option.id}`}
            onClick={() => {
              if (!disabled) onChange(option.id);
            }}
            className={`relative rounded-md px-2 py-1.5 text-center text-xs transition-colors ${
              layout === "sidebar" ? "px-2 py-1 text-[10px]" : ""
            } ${isToolbar ? "min-w-[4.5rem] px-2 py-1 text-[10px]" : ""} ${
              selected
                ? "bg-[var(--ws-accent)] font-semibold text-white shadow-[0_0_0_1px_rgba(91,141,239,0.24)]"
                : disabled
                  ? "cursor-not-allowed text-[var(--ws-text-faint)]"
                  : "text-[var(--ws-text-secondary)] hover:bg-white/5 hover:text-[var(--ws-text-main)]"
            }`}
          >
            <div className="flex items-center justify-center gap-1">
              <span>{option.label}</span>
              {option.id === "council" && !disabled && (
                <span
                  data-testid="workspace-execution-mode-council-badge"
                  className="rounded bg-white/10 px-1 text-[9px] font-bold text-[var(--ws-text-secondary)]"
                >
                  $$
                </span>
              )}
              {optionId === "turbo" && !disabled && (
                <span
                  data-testid="workspace-execution-mode-turbo-badge"
                  className="rounded bg-white/10 px-1 text-[9px] font-bold text-[var(--ws-text-secondary)]"
                >
                  $$$
                </span>
              )}
            </div>
            {!compact && layout !== "sidebar" && !isToolbar && (
              <div className="mt-0.5 text-[10px] font-normal opacity-80">{option.hint}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
