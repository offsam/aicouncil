"use client";

import { useWorkspaceOverlayLayer } from "./WorkspaceOverlayContext";

type DeleteBuildingModalProps = {
  open: boolean;
  buildingId?: string;
  chamberCount: number;
  buildingLabel: string;
  onClose: () => void;
};

export function DeleteBuildingModal({
  open,
  buildingId,
  chamberCount,
  buildingLabel,
  onClose,
}: DeleteBuildingModalProps) {
  useWorkspaceOverlayLayer(buildingId, open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-building-title"
    >
      <div className="max-w-md rounded-lg border border-stone-700 bg-stone-900 p-5 shadow-xl">
        <h2 id="delete-building-title" className="mb-2 text-base font-semibold text-stone-100">
          Cannot delete Building
        </h2>
        <p className="mb-4 text-sm text-stone-400">
          Cannot delete Building.{" "}
          <span className="text-stone-200">{buildingLabel}</span> contains{" "}
          {chamberCount} Chamber{chamberCount === 1 ? "" : "s"}. Move or delete
          Chambers first.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-stone-200 px-4 py-2 text-sm font-medium text-stone-900"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
