"use client";

type DeleteConnectionModalProps = {
  open: boolean;
  label: string;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteConnectionModal({
  open,
  label,
  deleting,
  onClose,
  onConfirm,
}: DeleteConnectionModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-stone-700 bg-stone-900 p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-stone-100">Delete connection</h3>
        <p className="mt-2 text-sm text-stone-400">{label}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded px-3 py-1.5 text-sm text-stone-400 hover:text-stone-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded bg-red-700 px-3 py-1.5 text-sm text-stone-100 disabled:opacity-50"
          >
            {deleting ? "…" : "Delete connection"}
          </button>
        </div>
      </div>
    </div>
  );
}
