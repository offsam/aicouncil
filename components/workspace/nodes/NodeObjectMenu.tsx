"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { useNodeId } from "@xyflow/react";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceActionsContext";
import { useWorkspaceLocale } from "@/components/workspace/WorkspaceLocaleContext";
import { useWorkspaceSelection } from "@/components/workspace/WorkspaceSelectionContext";
import { useWorkspaceOverlayLayer } from "@/components/workspace/WorkspaceOverlayContext";
import type { InspectorTarget } from "@/lib/workspace/inspector-target";
import {
  connectRegistryIdFromMenuTarget,
  objectMenuTitle,
  type WorkspaceAddMenuActionId,
  type WorkspaceAddMenuTarget,
  workspaceAddMenuOptions,
} from "@/lib/workspace/workspace-add-menu";
import {
  useClampedMenuPanelStyle,
  useZoomAnchoredMenuPosition,
} from "@/components/workspace/nodes/useZoomAnchoredMenuPosition";

type NodeObjectMenuProps = {
  target: WorkspaceAddMenuTarget;
  testId: string;
  onDelete?: () => void;
  variant?: "floating" | "embedded";
};

const MODAL_STEPS: Set<WorkspaceAddMenuActionId> = new Set([
  "rule",
  "knowledge",
  "routing",
  "agent",
  "color",
]);

function inspectorTargetFromMenu(target: WorkspaceAddMenuTarget): InspectorTarget | null {
  if (target.kind === "agent") return null;
  if (target.kind === "building") {
    return {
      kind: "building",
      officeId: target.officeId,
      buildingId: target.buildingId,
      label: target.label,
    };
  }
  return {
    kind: "chamber",
    officeId: target.officeId,
    buildingId: target.buildingId,
    chamberId: target.chamberId,
    registryId: target.registryId,
    label: target.label,
  };
}

export function NodeObjectMenu({
  target,
  testId,
  onDelete,
  variant = "floating",
}: NodeObjectMenuProps) {
  const { t } = useWorkspaceLocale();
  const { openInspector } = useWorkspaceSelection();
  const {
    createChamber,
    startConnectFrom,
    openAddMenu,
    openAgentInspector,
  } = useWorkspaceActions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nodeId = useNodeId();

  useWorkspaceOverlayLayer(nodeId ?? undefined, open);
  const { anchor } = useZoomAnchoredMenuPosition(open, buttonRef);
  const panelStyle = useClampedMenuPanelStyle(open, anchor, variant, panelRef);

  const options = workspaceAddMenuOptions(target.kind, t, {
    isCityHall: target.kind === "building" ? target.isCityHall : undefined,
  });
  const title = objectMenuTitle(target, t);
  const targetKey =
    target.kind === "building"
      ? target.buildingId
      : target.kind === "chamber"
        ? target.registryId
        : target.assignmentId;

  useEffect(() => {
    setOpen(false);
    setBusy(false);
  }, [targetKey]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", close);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  const runAction = useCallback(
    async (id: WorkspaceAddMenuActionId) => {
      if (id === "delete") {
        setOpen(false);
        onDelete?.();
        return;
      }
      if (id === "connect") {
        startConnectFrom(connectRegistryIdFromMenuTarget(target));
        setOpen(false);
        return;
      }
      if (id === "inspector") {
        if (target.kind === "agent") {
          openAgentInspector(target.assignmentId);
        } else {
          const inspectorTarget = inspectorTargetFromMenu(target);
          if (inspectorTarget) openInspector(inspectorTarget);
        }
        setOpen(false);
        return;
      }
      if (id === "chamber" && target.kind === "building") {
        setBusy(true);
        try {
          await createChamber(target.buildingId);
          setOpen(false);
        } finally {
          setBusy(false);
        }
        return;
      }
      if (MODAL_STEPS.has(id)) {
        setOpen(false);
        openAddMenu(target, id);
        return;
      }
    },
    [
      createChamber,
      onDelete,
      openAddMenu,
      openAgentInspector,
      openInspector,
      startConnectFrom,
      target,
    ],
  );

  const embedded = variant === "embedded";

  const menuPanel = open && anchor && (
    <div
      ref={panelRef}
      role="menu"
      aria-label={title}
      data-testid={`${testId}-panel`}
      className={`workspace-node-menu-panel workspace-node-menu-panel--portal nodrag nopan ${
        embedded ? "workspace-node-menu-panel--embedded" : ""
      }`}
      style={panelStyle}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="workspace-node-menu-panel-header">
        <h4 className="workspace-bubble-sheet__title text-xs leading-snug">{title}</h4>
        <span className="workspace-node-menu-panel-kind">{target.kind}</span>
      </div>
      <ul className="workspace-node-menu-panel-list">
        {options.map((opt) => (
          <li key={opt.id}>
            <button
              type="button"
              role="menuitem"
              data-testid={`workspace-node-menu-${opt.id}`}
              disabled={busy}
              onClick={() => void runAction(opt.id)}
              className={`workspace-node-menu-item w-full text-left ${
                opt.danger ? "workspace-node-menu-item--danger" : ""
              }`}
            >
              <span className="block text-sm font-medium">{opt.label}</span>
              <span className="block text-[11px] leading-tight opacity-70">{opt.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={`workspace-node-menu-root ${embedded ? "workspace-node-menu-root--embedded" : ""}`}
    >
      <button
        ref={buttonRef}
        type="button"
        title={t.nodeMenuButtonLabel}
        aria-label={t.nodeMenuButtonLabel}
        aria-expanded={open}
        data-testid={testId}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`nodrag nopan workspace-node-menu-btn ${
          embedded ? "workspace-neon-title-menu-btn" : "box-border flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-stone-300 shadow-[0_0_12px_rgba(0,0,0,0.18)] transition hover:scale-105 hover:bg-white/10 hover:text-stone-100 disabled:opacity-50"
        }`}
      >
        {busy ? "…" : <MoreVertical className="h-3.5 w-3.5" />}
      </button>

      {typeof document !== "undefined" && menuPanel
        ? createPortal(menuPanel, document.body)
        : null}
    </div>
  );
}
