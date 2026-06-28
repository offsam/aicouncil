"use client";

import type { InspectorViewMode } from "@/lib/workspace/inspector-mode";

type InspectorModeToggleProps = {
  mode: InspectorViewMode;
  onChange: (mode: InspectorViewMode) => void;
};

export function InspectorModeToggle({ mode, onChange }: InspectorModeToggleProps) {
  return (
    <div
      className="workspace-inspector-mode"
      role="tablist"
      aria-label="Режим панели объекта"
      data-testid="workspace-inspector-mode-toggle"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "basic"}
        data-testid="workspace-inspector-mode-basic"
        onClick={() => onChange("basic")}
        className={`workspace-inspector-mode__btn ${
          mode === "basic" ? "workspace-inspector-mode__btn--active" : ""
        }`}
      >
        Базовый
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "professional"}
        data-testid="workspace-inspector-mode-professional"
        onClick={() => onChange("professional")}
        className={`workspace-inspector-mode__btn ${
          mode === "professional" ? "workspace-inspector-mode__btn--active" : ""
        }`}
      >
        Профессиональный
      </button>
    </div>
  );
}
