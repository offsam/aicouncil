"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNodeId } from "@xyflow/react";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceActionsContext";
import { useWorkspaceLocale } from "@/components/workspace/WorkspaceLocaleContext";
import { useWorkspaceSelection } from "@/components/workspace/WorkspaceSelectionContext";
import { useWorkspaceOverlayLayer } from "@/components/workspace/WorkspaceOverlayContext";
import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";
import type { InspectorTarget } from "@/lib/workspace/inspector-target";
import {
  TECH_DEPARTMENT_COUNTER_CATALOG,
  type TechDepartmentCounterDef,
} from "@/lib/workspace/tech-department-counters";
import {
  useClampedMenuPanelStyle,
  useZoomAnchoredMenuPosition,
} from "@/components/workspace/nodes/useZoomAnchoredMenuPosition";

type TechDepartmentMenuProps = {
  buildingId: string;
  label: string;
  visibleCounterIds: string[];
  testId: string;
};

function TechMenuIcon() {
  return (
    <span className="workspace-tech-dept-menu-icon" aria-hidden>
      <span className="workspace-tech-dept-menu-icon-pulse" />
      <span className="workspace-tech-dept-menu-icon-core">⚙</span>
    </span>
  );
}

export function TechDepartmentMenu({
  buildingId,
  label,
  visibleCounterIds,
  testId,
}: TechDepartmentMenuProps) {
  const { t } = useWorkspaceLocale();
  const { openInspector } = useWorkspaceSelection();
  const { startConnectFrom, setTechDepartmentVisibleCounters } = useWorkspaceActions();
  const [open, setOpen] = useState(false);
  const [countersOpen, setCountersOpen] = useState(false);
  const [draftCounters, setDraftCounters] = useState<string[]>(visibleCounterIds);
  const [savingCounters, setSavingCounters] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nodeId = useNodeId();

  useWorkspaceOverlayLayer(nodeId ?? undefined, open);
  const { anchor } = useZoomAnchoredMenuPosition(open, buttonRef);
  const panelStyle = useClampedMenuPanelStyle(open, anchor, "embedded", panelRef);

  useEffect(() => {
    setDraftCounters(visibleCounterIds);
  }, [visibleCounterIds]);

  useEffect(() => {
    if (!open) setCountersOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const timer = window.setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  const inspectorTarget: InspectorTarget = {
    kind: "building",
    officeId: AI_COUNCIL_OFFICE_ID,
    buildingId,
    label,
  };

  const toggleCounter = useCallback((id: string) => {
    setDraftCounters((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }, []);

  const saveCounters = useCallback(async () => {
    setSavingCounters(true);
    try {
      await setTechDepartmentVisibleCounters(draftCounters);
      setCountersOpen(false);
      setOpen(false);
    } finally {
      setSavingCounters(false);
    }
  }, [draftCounters, setTechDepartmentVisibleCounters]);

  const menuPanel = open && anchor && (
    <div
      ref={panelRef}
      role="menu"
      aria-label={t.techDeptMenuTitle}
      data-testid={`${testId}-panel`}
      className="workspace-node-menu-panel workspace-node-menu-panel--portal workspace-node-menu-panel--tech-dept nodrag nopan"
      style={panelStyle}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="workspace-node-menu-panel-header workspace-node-menu-panel-header--tech">
        <h4 className="text-xs font-semibold leading-snug text-violet-100">{t.techDeptMenuTitle}</h4>
        <p className="mt-0.5 text-[10px] leading-tight text-violet-300/70">{label}</p>
      </div>

      {!countersOpen ? (
        <ul className="workspace-node-menu-panel-list">
          <li>
            <button
              type="button"
              role="menuitem"
              className="workspace-node-menu-item workspace-node-menu-item--tech w-full text-left"
              onClick={() => {
                openInspector(inspectorTarget);
                setOpen(false);
              }}
            >
              <span className="block text-sm font-medium">{t.techDeptMenuMonitoring}</span>
              <span className="block text-[11px] leading-tight opacity-70">{t.techDeptMenuMonitoringDesc}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              role="menuitem"
              className="workspace-node-menu-item workspace-node-menu-item--tech w-full text-left"
              onClick={() => setCountersOpen(true)}
            >
              <span className="block text-sm font-medium">{t.techDeptMenuCounters}</span>
              <span className="block text-[11px] leading-tight opacity-70">
                {t.techDeptMenuCountersDesc(visibleCounterIds.length, TECH_DEPARTMENT_COUNTER_CATALOG.length)}
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              role="menuitem"
              className="workspace-node-menu-item workspace-node-menu-item--tech w-full text-left"
              onClick={() => {
                startConnectFrom(buildingId);
                setOpen(false);
              }}
            >
              <span className="block text-sm font-medium">{t.menuConnect}</span>
              <span className="block text-[11px] leading-tight opacity-70">{t.techDeptMenuConnectDesc}</span>
            </button>
          </li>
        </ul>
      ) : (
        <div className="workspace-tech-dept-counter-picker">
          <p className="px-3 pt-2 text-[10px] leading-snug text-violet-300/80">{t.techDeptCounterPickerHint}</p>
          <ul className="workspace-tech-dept-counter-picker-list">
            {TECH_DEPARTMENT_COUNTER_CATALOG.map((def: TechDepartmentCounterDef) => {
              const checked = draftCounters.includes(def.id);
              return (
                <li key={def.id}>
                  <label className="workspace-tech-dept-counter-picker-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCounter(def.id)}
                    />
                    <span className="workspace-tech-dept-counter-picker-label">{def.label}</span>
                    {def.shortLabel ? (
                      <span className="workspace-tech-dept-counter-picker-sub">{def.shortLabel}</span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="workspace-tech-dept-counter-picker-actions">
            <button
              type="button"
              className="workspace-tech-dept-counter-picker-back"
              onClick={() => {
                setDraftCounters(visibleCounterIds);
                setCountersOpen(false);
              }}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              disabled={savingCounters}
              className="workspace-tech-dept-counter-picker-save"
              onClick={() => void saveCounters()}
            >
              {savingCounters ? "…" : t.techDeptCounterPickerSave}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className="workspace-node-menu-root workspace-node-menu-root--embedded workspace-node-menu-root--tech">
      <button
        ref={buttonRef}
        type="button"
        title={t.techDeptMenuTitle}
        aria-label={t.techDeptMenuTitle}
        aria-expanded={open}
        data-testid={testId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="nodrag nopan workspace-neon-title-menu-btn workspace-neon-title-menu-btn--tech"
      >
        <TechMenuIcon />
      </button>

      {typeof document !== "undefined" && menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  );
}
