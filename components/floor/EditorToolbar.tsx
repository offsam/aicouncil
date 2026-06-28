"use client";

import { Info, RotateCw, Trash2, Undo2, X } from "lucide-react";
import type { OfficeObjectType } from "@/lib/office-types";
import { isRotatableObject } from "@/lib/office-bounds";
import { CITY } from "@/lib/city-labels";

export function ConnectionToolbar({
  label,
  onDelete,
  onClose,
}: {
  label: string;
  onDelete?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="theme-panel-solid flex items-center gap-1 rounded-2xl p-1.5 shadow-2xl">
        <span className="max-w-[200px] truncate px-3 text-sm font-medium text-theme-secondary">
          {label}
        </span>
        {onDelete && (
          <>
            <div className="mx-1 h-6 w-px bg-zinc-200 dark:bg-white/10" />
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-red-500 transition hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Удалить кабель
            </button>
          </>
        )}
        <div className="mx-1 h-6 w-px bg-zinc-200 dark:bg-white/10" />
        <button
          type="button"
          onClick={onClose}
          className="ml-1 rounded-xl p-2 text-theme-muted transition hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface EditorToolbarProps {
  label: string;
  objectType: OfficeObjectType;
  onRotate: () => void;
  onDelete?: () => void;
  onInfo?: () => void;
  onOpen?: () => void;
  onColor?: () => void;
  onClose: () => void;
  editableName?: {
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
    onCommit: () => void;
  };
}

export function EditorToolbar({
  label,
  objectType,
  onRotate,
  onDelete,
  onInfo,
  onOpen,
  onColor,
  onClose,
  editableName,
}: EditorToolbarProps) {
  const rotatable = isRotatableObject(objectType);
  const hasPanel = objectType === "cabinet" || objectType === "board" || objectType === "room";
  const paintable = objectType === "wall" || objectType === "door" || objectType === "room";

  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="theme-panel-solid flex items-center gap-1 rounded-2xl p-1.5 shadow-2xl">
        {editableName ? (
          <input
            type="text"
            value={editableName.value}
            placeholder={editableName.placeholder ?? CITY.roomNamePlaceholder}
            onChange={(e) => editableName.onChange(e.target.value)}
            onBlur={editableName.onCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="mx-1 max-w-[180px] rounded-lg border border-zinc-200 bg-white/90 px-3 py-1.5 text-sm text-theme-primary outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/[0.06] dark:focus:border-teal-400"
          />
        ) : (
          <span className="max-w-[140px] truncate px-3 text-sm font-medium text-theme-secondary">
            {label}
          </span>
        )}
        <div className="mx-1 h-6 w-px bg-zinc-200 dark:bg-white/10" />
        {paintable && onColor && (
          <button
            type="button"
            onClick={onColor}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-theme-secondary transition hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
          >
            <span className="h-4 w-4 rounded-full border border-black/10 bg-gradient-to-br from-stone-200 to-stone-400 dark:from-stone-600 dark:to-stone-800" />
            Цвет
          </button>
        )}
        {rotatable && (
          <button
            type="button"
            onClick={onRotate}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-theme-secondary transition hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
            title="Повернуть 90° (R)"
          >
            <RotateCw className="h-4 w-4" />
            Повернуть
          </button>
        )}
        {objectType === "desk" && onInfo && (
          <button
            type="button"
            onClick={onInfo}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-theme-secondary transition hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
          >
            <Info className="h-4 w-4" />
            Агент
          </button>
        )}
        {hasPanel && onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-theme-secondary transition hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
          >
            <Info className="h-4 w-4" />
            Открыть
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-red-500 transition hover:bg-red-500/10"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
            Удалить
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-1 rounded-xl p-2 text-theme-muted transition hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function SimsBuildBar({
  wallMode,
  roomMode,
  deleteMode,
  cableMode,
  placement,
  topDown,
  onToggleTopDown,
  onClearAll,
  onSelectAll,
  onDeleteSelected,
  selectedCount = 0,
  canUndo = false,
  undoCount = 0,
  onUndo,
  onDone,
}: {
  wallMode: boolean;
  roomMode: boolean;
  deleteMode: boolean;
  cableMode: boolean;
  placement: { objectType: string } | null;
  topDown: boolean;
  onToggleTopDown: () => void;
  onClearAll?: () => void;
  onSelectAll?: () => void;
  onDeleteSelected?: () => void;
  selectedCount?: number;
  canUndo?: boolean;
  undoCount?: number;
  onUndo?: () => void;
  onDone: () => void;
}) {
  const hint = wallMode
    ? "Стена — зажмите ЛКМ, потяните по сетке · отпустите — стена остаётся · Shift — любой угол"
    : roomMode
      ? "Здание — квадрат у курсора · зажмите ЛКМ, потяните участок · отпустите — участок остаётся"
      : deleteMode
        ? "Bulldozer — клик по объекту — удалить · стена — участок · пол — выделите и отпустите"
        : cableMode
          ? "Кабель — клик по зданию"
          : placement
            ? `Клик на площадку — поставить · Q/E поворот · ${placement.objectType}`
            : "Застройка города";

  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="theme-panel-solid flex items-center gap-2 rounded-2xl p-1.5 shadow-2xl">
        <span className="max-w-[min(420px,55vw)] px-3 text-sm text-theme-secondary">{hint}</span>
        <div className="mx-1 h-6 w-px bg-zinc-200 dark:bg-white/10" />
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Отменить (Ctrl+Z)"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-theme-secondary transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.06]"
          >
            <Undo2 className="h-4 w-4" />
            Отменить{undoCount > 0 ? ` (${undoCount})` : ""}
          </button>
        )}
        <div className="mx-1 h-6 w-px bg-zinc-200 dark:bg-white/10" />
        {deleteMode && onSelectAll && (
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-xl px-3 py-2 text-sm text-theme-secondary transition hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
          >
            Выделить всё
          </button>
        )}
        {deleteMode && onDeleteSelected && (
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            Удалить выделенное{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
        )}
        {deleteMode && onClearAll && (
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-red-500 transition hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
            Удалить всё
          </button>
        )}
        <button
          type="button"
          onClick={onToggleTopDown}
          className={`rounded-xl px-3 py-2 text-sm transition ${
            topDown
              ? "bg-teal-500/15 text-teal-700 dark:text-teal-300"
              : "text-theme-secondary hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
          }`}
        >
          {topDown ? "3D вид" : "Сверху"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
        >
          Готово
        </button>
      </div>
    </div>
  );
}

export function MoveModeBar({
  selectedCount,
  onClearSelection,
  canUndo = false,
  undoCount = 0,
  onUndo,
  onDone,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  canUndo?: boolean;
  undoCount?: number;
  onUndo?: () => void;
  onDone: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="theme-panel-solid flex items-center gap-2 rounded-2xl p-1.5 shadow-2xl">
        <span className="max-w-[min(440px,58vw)] px-3 text-sm text-theme-secondary">
          Перемещение — клик выделяет · drag по полу — рамка · отпустите — выделение остаётся · снова клик и тяните объект
          {selectedCount > 0 ? ` · выбрано: ${selectedCount}` : ""}
        </span>
        <div className="mx-1 h-6 w-px bg-zinc-200 dark:bg-white/10" />
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Отменить (Ctrl+Z)"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-theme-secondary transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.06]"
          >
            <Undo2 className="h-4 w-4" />
            Отменить{undoCount > 0 ? ` (${undoCount})` : ""}
          </button>
        )}
        <button
          type="button"
          onClick={onClearSelection}
          disabled={selectedCount === 0}
          className="rounded-xl px-3 py-2 text-sm text-theme-secondary transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.06]"
        >
          Снять выделение
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
        >
          Готово
        </button>
      </div>
    </div>
  );
}

export function SelectionMoveHint({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="theme-panel-solid flex items-center gap-2 rounded-2xl p-1.5 shadow-2xl">
        <span className="px-3 text-sm text-theme-secondary">
          Выбрано {count} — потяните любой объект для перемещения группы
        </span>
        <button
          type="button"
          onClick={onClear}
          className="rounded-xl px-3 py-2 text-sm text-theme-secondary transition hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
        >
          Снять
        </button>
      </div>
    </div>
  );
}
