"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useViewport } from "@xyflow/react";
import {
  computeTooltipPlacement,
  getViewportRect,
  type AnchorRect,
} from "@/lib/ui/floating-panel-placement";

type WorkspaceNodeTooltipProps = {
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  statusLabel: string;
  metricLabel: string;
  metricValue: string;
};

const TOOLTIP_Z_INDEX = 1450;
const ESTIMATED_WIDTH = 144;
const ESTIMATED_HEIGHT = 72;

export function WorkspaceNodeTooltip({
  anchorRef,
  title,
  statusLabel,
  metricLabel,
  metricValue,
}: WorkspaceNodeTooltipProps) {
  const viewport = useViewport();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | undefined>();

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;

    const show = () => setOpen(true);
    const hide = () => setOpen(false);

    el.addEventListener("mouseenter", show);
    el.addEventListener("mouseleave", hide);
    return () => {
      el.removeEventListener("mouseenter", show);
      el.removeEventListener("mouseleave", hide);
    };
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setStyle(undefined);
      return;
    }

    const update = () => {
      const anchorEl = anchorRef.current;
      if (!anchorEl) return;

      const rect = anchorEl.getBoundingClientRect();
      const anchor: AnchorRect = {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      };
      const panel = panelRef.current;
      const width = panel?.offsetWidth ?? ESTIMATED_WIDTH;
      const height = panel?.offsetHeight ?? ESTIMATED_HEIGHT;
      const placement = computeTooltipPlacement(anchor, width, height, getViewportRect());

      setStyle({
        position: "fixed",
        top: placement.top,
        left: placement.left,
        zIndex: TOOLTIP_Z_INDEX,
        pointerEvents: "none",
        transformOrigin: placement.transformOrigin,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, open, viewport.x, viewport.y, viewport.zoom]);

  if (typeof document === "undefined" || !open || !style) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="workspace-node-tooltip workspace-node-tooltip--portal nodrag nopan"
      style={style}
      aria-hidden="true"
    >
      <div className="workspace-node-tooltip-title">{title}</div>
      <div className="workspace-node-tooltip-row">
        <span className="workspace-node-tooltip-key">status</span>
        <span className="workspace-node-tooltip-value">{statusLabel}</span>
      </div>
      <div className="workspace-node-tooltip-row">
        <span className="workspace-node-tooltip-key">{metricLabel}</span>
        <span className="workspace-node-tooltip-value">{metricValue}</span>
      </div>
    </div>,
    document.body,
  );
}
