"use client";

import { AgentRobotAvatar } from "@/components/workspace/nodes/AgentRobotAvatar";
import {
  AGENT_ICON_OPTIONS,
  type AgentIconId,
} from "@/components/workspace/agent-icon-catalog";

type InspectorAgentIconPickerProps = {
  selectedIconId: AgentIconId;
  onSelect: (id: AgentIconId) => void;
  selectedSizePx: number;
  onSizeChange: (sizePx: number) => void;
  onApply: () => void;
  saving?: boolean;
  testIdPrefix?: string;
  compact?: boolean;
};

export function InspectorAgentIconPicker({
  selectedIconId,
  onSelect,
  selectedSizePx,
  onSizeChange,
  onApply,
  saving = false,
  testIdPrefix = "workspace-inspector-agent-icon",
  compact = false,
}: InspectorAgentIconPickerProps) {
  return (
    <div className="w-full min-w-0 space-y-2">
      <div
        className={`grid w-full gap-1 overflow-y-auto pr-0.5 ${
          compact
            ? "max-h-40 grid-cols-[repeat(4,minmax(0,1fr))]"
            : "max-h-48 grid-cols-[repeat(5,minmax(0,1fr))]"
        }`}
      >
        {AGENT_ICON_OPTIONS.map((option) => {
          const selected = selectedIconId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`${testIdPrefix}-${option.id}`}
              disabled={saving}
              onClick={() => onSelect(option.id)}
              title={option.label}
              className={`workspace-inspector-icon-tile ${
                selected ? "workspace-inspector-icon-tile--selected" : ""
              }`}
            >
              <AgentRobotAvatar
                label={option.label}
                provider=""
                agentId={option.id}
                tone="running"
                iconId={option.id}
                sizePx={28}
              />
              <span className="truncate text-[10px]">{option.label}</span>
            </button>
          );
        })}
      </div>

      <label className="workspace-inspector-label">
        Размер
        <input
          type="range"
          min={16}
          max={160}
          step={2}
          value={selectedSizePx}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          disabled={saving}
          className="workspace-inspector-range mt-1 w-full"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--ws-text-faint)]">
          <span>маленький</span>
          <span>{selectedSizePx}px</span>
          <span>большой</span>
        </div>
      </label>

      <button
        type="button"
        disabled={saving}
        onClick={onApply}
        className="workspace-bubble-btn workspace-bubble-btn--primary"
      >
        {saving ? "…" : "Применить вид"}
      </button>
    </div>
  );
}
