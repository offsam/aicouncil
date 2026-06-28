"use client";

import { Trash2 } from "lucide-react";

export function DeleteHoverHint({ label }: { label: string | null }) {
  if (!label) return null;

  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 shadow-xl backdrop-blur-md dark:bg-red-950/40">
        <Trash2 className="h-4 w-4 shrink-0 text-red-500" />
        <span className="text-sm font-medium text-red-600 dark:text-red-300">
          Будет удалено: {label}
        </span>
      </div>
    </div>
  );
}
