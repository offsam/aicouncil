"use client";

import {
  BUILDING_ACCENT_PALETTE,
  type BuildingAccentId,
} from "@/lib/workspace/building-accent";

type InspectorColorPickerProps = {
  selectedColorId: BuildingAccentId;
  onSelect: (id: BuildingAccentId) => void;
  onApply: () => void;
  saving?: boolean;
  testIdPrefix?: string;
  compact?: boolean;
  hint?: string;
};

export function InspectorColorPicker({
  selectedColorId,
  onSelect,
  onApply,
  saving = false,
  testIdPrefix = "workspace-inspector-color",
  compact = false,
  hint,
}: InspectorColorPickerProps) {
  return (
    <div className="w-full min-w-0">
      {hint ? <p className="workspace-inspector-hint mb-2">{hint}</p> : null}
      <div
        className={`grid w-full gap-1.5 overflow-y-auto pr-0.5 ${
          compact
            ? "max-h-36 grid-cols-[repeat(8,minmax(0,1fr))]"
            : "max-h-40 grid-cols-[repeat(8,minmax(0,1fr))]"
        }`}
      >
        {BUILDING_ACCENT_PALETTE.map((accent) => {
          const selected = selectedColorId === accent.id;
          return (
            <button
              key={accent.id}
              type="button"
              data-testid={`${testIdPrefix}-${accent.id}`}
              disabled={saving}
              onClick={() => onSelect(accent.id)}
              title={accent.id}
              className={`aspect-square min-w-0 w-full rounded-full p-0 transition ${
                selected ? "scale-105" : "hover:scale-105"
              }`}
            >
              <span
                className="block h-full w-full rounded-full border-2"
                style={{
                  borderColor: accent.border,
                  background: accent.bg,
                  boxShadow: selected
                    ? `0 0 0 2px color-mix(in srgb, var(--ws-panel-bg, #101521) 85%, transparent), 0 0 0 3px ${accent.border}, 0 4px 16px ${accent.glow}`
                    : `0 2px 10px ${accent.glow}`,
                }}
              />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={onApply}
        className="workspace-bubble-btn workspace-bubble-btn--primary mt-2.5"
      >
        {saving ? "…" : "Применить цвет"}
      </button>
    </div>
  );
}
