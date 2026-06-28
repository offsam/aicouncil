"use client";

import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from "react";
import { buildingAccentCssVars } from "@/lib/workspace/building-accent";

type NodeNeonTitleBandProps = {
  label: string;
  variant: "building" | "chamber";
  accentIndex?: number;
  accentStyle?: Record<string, string>;
  editing?: boolean;
  draft?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onDraftChange?: (value: string) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  testId?: string;
  onTitleClick?: (e: React.MouseEvent) => void;
  leftMetrics?: ReactNode;
  rightMetrics?: ReactNode;
  menu?: ReactNode;
};

export function NodeNeonTitleBand({
  label,
  variant,
  accentIndex = 0,
  accentStyle,
  editing = false,
  draft = "",
  inputRef,
  onDraftChange,
  onCommit,
  onCancel,
  testId,
  onTitleClick,
  leftMetrics,
  rightMetrics,
  menu,
}: NodeNeonTitleBandProps) {
  const vars = accentStyle ?? buildingAccentCssVars(accentIndex);
  const style = {
    ...vars,
    "--ws-neon-color": vars["--ws-building-border"],
    "--ws-neon-glow": vars["--ws-building-glow"],
  } as CSSProperties;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit?.();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    }
  }

  return (
    <div
      style={style}
      className={`workspace-neon-title-band workspace-neon-title-band--${variant}`}
      data-testid={testId}
    >
      <span className="workspace-neon-title-bracket" aria-hidden>
        [
      </span>
      <div className="workspace-neon-title-row min-w-0 flex-1">
        {!editing && (
          <div className="workspace-neon-title-side workspace-neon-title-side--left">
            {leftMetrics}
          </div>
        )}
        <div className="workspace-neon-title-core min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => onDraftChange?.(e.target.value)}
              onBlur={() => onCommit?.()}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="workspace-neon-title-input nodrag nopan w-full bg-transparent text-center outline-none"
            />
          ) : onTitleClick ? (
            <button
              type="button"
              className="workspace-neon-title-text nodrag nopan w-full"
              onClick={onTitleClick}
            >
              {label}
            </button>
          ) : (
            <div className="workspace-neon-title-text w-full">{label}</div>
          )}
        </div>
        {!editing && (
          <div className="workspace-neon-title-side workspace-neon-title-side--right">
            {rightMetrics}
            {menu}
          </div>
        )}
      </div>
      <span className="workspace-neon-title-bracket workspace-neon-title-bracket--right" aria-hidden>
        ]
      </span>
    </div>
  );
}
