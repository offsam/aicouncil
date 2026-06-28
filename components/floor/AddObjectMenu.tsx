"use client";

import { useEffect, useRef } from "react";
import {
  BookOpen,
  Cable,
  ClipboardList,
  DoorOpen,
  Flower2,
  LayoutGrid,
  Move,
  Square,
  Trash2,
  TreePine,
  User,
  Warehouse,
  LayoutTemplate,
  Shrub,
  X,
} from "lucide-react";

export type AddMenuAction =
  | { kind: "desk" }
  | { kind: "place"; objectType: "door" | "cabinet" | "board" | "tree" | "bush" | "flower" }
  | { kind: "drawWall" }
  | { kind: "drawRoom" }
  | { kind: "move" }
  | { kind: "delete" }
  | { kind: "cable" }
  | { kind: "seedWalls" };

const ITEMS = [
  { id: "desk" as const, label: "Рабочий стол", icon: User, desc: "Посадить агента" },
  { id: "wall" as const, label: "Стена", icon: Square, desc: "Зажать ЛКМ и потянуть стену" },
  { id: "room" as const, label: "Здание", icon: LayoutTemplate, desc: "Зажать ЛКМ и выделить участок" },
  { id: "door" as const, label: "Дверь", icon: DoorOpen, desc: "Проём в стене" },
  { id: "cabinet" as const, label: "Комод", icon: BookOpen, desc: "База знаний" },
  { id: "board" as const, label: "Указ", icon: ClipboardList, desc: "Правила города" },
  { id: "tree" as const, label: "Ель", icon: TreePine, desc: "Хвойное дерево на газоне" },
  { id: "bush" as const, label: "Куст", icon: Shrub, desc: "Кустарник" },
  { id: "flower" as const, label: "Цветы", icon: Flower2, desc: "Цветочная клумба" },
  { id: "move" as const, label: "Переместить", icon: Move, desc: "Выделить и перетащить объекты" },
  { id: "cable" as const, label: "Кабель", icon: Cable, desc: "Связь центра города со зданием" },
  { id: "delete" as const, label: "Bulldozer", icon: Trash2, desc: "Выделить участок пола и снести" },
  { id: "seedWalls" as const, label: "Стены города", icon: Warehouse, desc: "Готовый периметр центра" },
];

const ICON_BTN =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-400/40 bg-white/90 text-stone-700 shadow-lg backdrop-blur-md transition hover:scale-105 hover:border-teal-500/45 hover:bg-teal-500/10 hover:text-teal-800 dark:border-white/12 dark:bg-zinc-900/85 dark:text-stone-200 dark:hover:border-teal-400/40 dark:hover:bg-teal-500/15 dark:hover:text-teal-200";

interface BuildMenuLauncherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: AddMenuAction) => void;
  onDeskClick: () => void;
}

function runItemAction(
  itemId: (typeof ITEMS)[number]["id"],
  onAction: (action: AddMenuAction) => void,
  onDeskClick: () => void,
  onClose: () => void,
) {
  if (itemId === "desk") {
    onDeskClick();
    onClose();
    return;
  }
  if (itemId === "wall") {
    onAction({ kind: "drawWall" });
    onClose();
    return;
  }
  if (itemId === "room") {
    onAction({ kind: "drawRoom" });
    onClose();
    return;
  }
  if (itemId === "move") {
    onAction({ kind: "move" });
    onClose();
    return;
  }
  if (itemId === "delete") {
    onAction({ kind: "delete" });
    onClose();
    return;
  }
  if (itemId === "cable") {
    onAction({ kind: "cable" });
    onClose();
    return;
  }
  if (itemId === "seedWalls") {
    onAction({ kind: "seedWalls" });
    onClose();
    return;
  }
  onAction({ kind: "place", objectType: itemId });
  onClose();
}

/** Кнопка «+» в левом нижнем углу; при открытии — столбец иконок вверх, подпись только при наведении. */
export function BuildMenuLauncher({
  open,
  onOpenChange,
  onAction,
  onDeskClick,
}: BuildMenuLauncherProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      onOpenChange(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="pointer-events-auto absolute bottom-5 left-5 z-30">
      <div className="flex flex-col-reverse items-center gap-2.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Закрыть меню застройки" : "Меню застройки"}
          onClick={() => onOpenChange(!open)}
          className={`${ICON_BTN} ${open ? "border-teal-500/50 bg-teal-500/15 text-teal-800 dark:text-teal-200" : ""}`}
        >
          {open ? <X className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
        </button>

        {open &&
          ITEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`${item.label}: ${item.desc}`}
                onClick={() =>
                  runItemAction(item.id, onAction, onDeskClick, () => onOpenChange(false))
                }
                className={`${ICON_BTN} group relative origin-bottom`}
                style={{
                  animation: "buildMenuItemIn 0.22s ease-out both",
                  animationDelay: `${index * 35}ms`,
                }}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-40 max-w-[220px] -translate-y-1/2 rounded-xl border border-zinc-200/80 bg-white/95 px-3 py-2 text-left opacity-0 shadow-xl backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 dark:border-white/10 dark:bg-zinc-900/95"
                >
                  <span className="block text-sm font-medium text-theme-secondary">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-theme-muted">
                    {item.desc}
                  </span>
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
