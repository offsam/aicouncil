"use client";

import { Panel } from "@xyflow/react";
import { Undo2 } from "lucide-react";
import { useState } from "react";
import {
  WORKSPACE_CANVAS_BG_DEFAULT,
  WORKSPACE_CANVAS_BG_PRESETS,
} from "@/lib/workspace/constants";
import { useWorkspaceLocale } from "./WorkspaceLocaleContext";
import { BuildingCreateDialog } from "./BuildingCreateDialog";

type WorkspaceToolbarProps = {
  onCreateBuilding: (name: string, routingDescription: string) => void;
  creating: boolean;
  connectMode: boolean;
  onToggleConnect: () => void;
  connectHint?: string | null;
  selectionCount?: number;
  connectionCount?: number;
  canvasBg?: string;
  onCanvasBgChange?: (color: string) => void;
  canUndo?: boolean;
  undoCount?: number;
  onUndo?: () => void;
};

export function WorkspaceToolbar({
  onCreateBuilding,
  creating,
  connectMode,
  onToggleConnect,
  connectHint,
  selectionCount = 0,
  connectionCount = 0,
  canvasBg = WORKSPACE_CANVAS_BG_DEFAULT,
  onCanvasBgChange,
  canUndo = false,
  undoCount = 0,
  onUndo,
}: WorkspaceToolbarProps) {
  const { t } = useWorkspaceLocale();
  const [colorOpen, setColorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <Panel position="top-left" className="!m-2.5 flex max-w-md flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={creating}
          onClick={() => setCreateOpen(true)}
          className="rounded border border-[var(--ws-control-border)] bg-[var(--ws-control-bg)] px-2.5 py-1.5 text-xs text-stone-200 shadow hover:bg-white/10 disabled:opacity-50"
          title={t.addBuilding}
        >
          {t.addBuilding}
        </button>

        {onUndo && (
          <button
            type="button"
            data-testid="workspace-undo-btn"
            disabled={!canUndo}
            onClick={onUndo}
            title={t.undoTitle}
            className="flex items-center gap-1 rounded border border-[var(--ws-control-border)] bg-[var(--ws-control-bg)] px-2 py-1.5 text-xs text-stone-200 shadow hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {t.undo}
            {undoCount > 0 ? ` (${undoCount})` : ""}
          </button>
        )}

        <button
          type="button"
          onClick={onToggleConnect}
          className={`rounded border px-2.5 py-1.5 text-xs shadow ${
            connectMode
              ? "border-amber-500 bg-amber-950 text-amber-200"
              : "border-[var(--ws-control-border)] bg-[var(--ws-control-bg)] text-stone-200 hover:bg-white/10"
          }`}
        >
          {connectMode ? t.connectActive : t.connect}
        </button>

        {connectionCount > 0 && (
          <span
            data-testid="workspace-connection-count"
            className="rounded border border-sky-700/60 bg-sky-950/50 px-2 py-1 text-[11px] text-sky-200"
            title="Кабели на канвасе"
          >
            {connectionCount} каб.
          </span>
        )}

        {selectionCount > 1 && (
          <span
            data-testid="workspace-selection-count"
            className="workspace-selection-count rounded border border-amber-700/60 bg-amber-950/50 px-2 py-1 text-[11px] text-amber-200"
          >
            {t.selectedCount(selectionCount)}
          </span>
        )}

        {onCanvasBgChange && (
          <div className="relative">
            <button
              type="button"
              data-testid="workspace-canvas-bg-toggle"
              onClick={() => setColorOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded border border-[var(--ws-control-border)] bg-[var(--ws-control-bg)] px-2 py-1.5 text-xs text-stone-200 shadow hover:bg-white/10"
              title={t.canvasBg}
            >
              <span
                className="h-4 w-4 rounded border border-white/20"
                style={{ background: canvasBg }}
              />
              {t.canvasBg}
            </button>
            {colorOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 rounded border border-stone-700 bg-stone-900 p-2 shadow-lg">
                <div className="mb-2 grid grid-cols-4 gap-1">
                  {WORKSPACE_CANVAS_BG_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      data-testid={`workspace-canvas-bg-${color.slice(1)}`}
                      title={color}
                      onClick={() => {
                        onCanvasBgChange(color);
                        setColorOpen(false);
                      }}
                      className={`h-7 w-7 rounded border ${
                        canvasBg === color ? "border-white ring-1 ring-white/40" : "border-stone-600"
                      }`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={canvasBg}
                  onChange={(e) => onCanvasBgChange(e.target.value)}
                  className="h-8 w-full cursor-pointer rounded border border-stone-700 bg-transparent"
                  data-testid="workspace-canvas-bg-picker"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {connectMode && connectHint && (
        <p className="rounded border border-amber-800/50 bg-amber-950/40 px-2 py-1 text-[11px] text-amber-200/90">
          {connectHint}
        </p>
      )}

      <BuildingCreateDialog
        open={createOpen}
        title={t.addBuilding}
        submitLabel={t.create}
        namePlaceholder={t.buildingNamePlaceholder}
        descriptionPlaceholder={t.buildingDescriptionPlaceholder}
        creating={creating}
        onCancel={() => setCreateOpen(false)}
        onSubmit={({ name, routingDescription }) => {
          onCreateBuilding(name, routingDescription);
          setCreateOpen(false);
        }}
      />
    </Panel>
  );
}
