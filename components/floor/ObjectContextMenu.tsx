"use client";

import type { OfficeObjectType } from "@/lib/office-types";
import { isRotatableObject } from "@/lib/office-bounds";

interface ObjectContextMenuProps {
  x: number;
  y: number;
  objectType: OfficeObjectType;
  onRotate?: () => void;
  onClose: () => void;
}

export function ObjectContextMenu({
  x,
  y,
  objectType,
  onRotate,
  onClose,
}: ObjectContextMenuProps) {
  const rotatable = isRotatableObject(objectType);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={onClose} />
      <div
        className="theme-panel-solid fixed z-50 min-w-[180px] rounded-xl py-1 shadow-2xl"
        style={{ left: x, top: y }}
      >
        {rotatable && onRotate && (
          <button
            type="button"
            onClick={() => {
              onRotate();
              onClose();
            }}
            className="w-full px-4 py-2 text-left text-sm text-theme-secondary hover:bg-zinc-100 dark:hover:bg-white/[0.05]"
          >
            Повернуть 90°
          </button>
        )}
        {!rotatable && (
          <p className="px-4 py-2 text-xs text-theme-muted">Снос — режим Bulldozer в конструкторе</p>
        )}
      </div>
    </>
  );
}
