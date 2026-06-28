"use client";

import { PASTEL_PALETTE, type PastelId, resolvePastel } from "@/lib/floor-pastel-palette";

interface ColorPickerPanelProps {
  title: string;
  isDark: boolean;
  currentId?: PastelId;
  currentHex?: string;
  onPick: (id: PastelId) => void;
  onClose: () => void;
}

export function ColorPickerPanel({
  title,
  isDark,
  currentId,
  currentHex,
  onPick,
  onClose,
}: ColorPickerPanelProps) {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-40 bg-black/15" />
      <div className="theme-panel-solid fixed left-1/2 top-1/2 z-50 w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-theme-primary">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-theme-muted hover:text-theme-secondary"
          >
            ✕
          </button>
        </div>
        <div className="grid max-h-64 grid-cols-5 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
          {PASTEL_PALETTE.map((swatch) => {
            const hex = resolvePastel(swatch.id, isDark);
            const selected =
              currentId === swatch.id ||
              (!currentId && currentHex?.toLowerCase() === hex.toLowerCase());
            return (
              <button
                key={swatch.id}
                type="button"
                title={swatch.label}
                onClick={() => {
                  onPick(swatch.id);
                  onClose();
                }}
                className={`flex flex-col items-center gap-1 rounded-xl p-1.5 transition ${
                  selected
                    ? "ring-2 ring-zinc-400 dark:ring-zinc-500"
                    : "hover:bg-zinc-100 dark:hover:bg-white/[0.05]"
                }`}
              >
                <span
                  className="h-10 w-10 rounded-lg border border-black/10 shadow-inner dark:border-white/10"
                  style={{ backgroundColor: hex }}
                />
                <span className="text-[10px] text-theme-faint">{swatch.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
