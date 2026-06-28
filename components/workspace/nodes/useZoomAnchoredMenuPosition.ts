"use client";

import {
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { useViewport } from "@xyflow/react";
import {
  computeClampedMenuPlacement,
  computeClampedPointPlacement,
  getViewportRect,
  type AnchorRect,
} from "@/lib/ui/floating-panel-placement";

export type MenuAnchorRect = AnchorRect;

const ESTIMATED_PANEL_WIDTH = 220;
const ESTIMATED_PANEL_HEIGHT = 280;

/** Fixed screen scale for portaled menus — independent of canvas zoom. */
export function useZoomAnchoredMenuPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
): {
  anchor: MenuAnchorRect | null;
} {
  const viewport = useViewport();
  const [anchor, setAnchor] = useState<MenuAnchorRect | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setAnchor(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({
        top: r.top,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, viewport.x, viewport.y, viewport.zoom]);

  return { anchor };
}

/** Viewport-safe fixed position for portaled node menus. */
export function useClampedMenuPanelStyle(
  open: boolean,
  anchor: MenuAnchorRect | null,
  variant: "floating" | "embedded",
  panelRef: RefObject<HTMLElement | null>,
): CSSProperties | undefined {
  const estimatedStyle = useMemo(() => {
    if (!open || !anchor) return undefined;
    const placement = computeClampedMenuPlacement(
      anchor,
      ESTIMATED_PANEL_WIDTH,
      ESTIMATED_PANEL_HEIGHT,
      variant,
    );
    return {
      position: "fixed" as const,
      zIndex: 1500,
      pointerEvents: "auto" as const,
      top: placement.top,
      left: placement.left,
      right: "auto" as const,
      bottom: "auto" as const,
      transformOrigin: placement.transformOrigin,
    };
  }, [open, anchor, variant]);

  const [style, setStyle] = useState<CSSProperties | undefined>(estimatedStyle);

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setStyle(undefined);
      return;
    }

    const update = () => {
      const panel = panelRef.current;
      const viewport = getViewportRect();
      const width = panel?.offsetWidth || ESTIMATED_PANEL_WIDTH;
      const height = panel?.offsetHeight || ESTIMATED_PANEL_HEIGHT;
      const placement = computeClampedMenuPlacement(anchor, width, height, variant, viewport);

      setStyle({
        position: "fixed",
        zIndex: 1500,
        pointerEvents: "auto",
        top: placement.top,
        left: placement.left,
        right: "auto",
        bottom: "auto",
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
  }, [open, anchor, variant, panelRef]);

  return style ?? estimatedStyle;
}

/** Viewport-safe fixed position for context menus opened at a pointer location. */
export function useClampedPointPanelStyle(
  active: boolean,
  point: { x: number; y: number } | null,
  panelRef: RefObject<HTMLElement | null>,
): CSSProperties | undefined {
  const estimatedStyle = useMemo(() => {
    if (!active || !point) return undefined;
    const placement = computeClampedPointPlacement(point, 160, 48);
    return {
      position: "fixed" as const,
      zIndex: 1300,
      top: placement.top,
      left: placement.left,
      right: "auto" as const,
      bottom: "auto" as const,
      transformOrigin: placement.transformOrigin,
    };
  }, [active, point]);

  const [style, setStyle] = useState<CSSProperties | undefined>(estimatedStyle);

  useLayoutEffect(() => {
    if (!active || !point) {
      setStyle(undefined);
      return;
    }

    const update = () => {
      const panel = panelRef.current;
      const viewport = getViewportRect();
      const width = panel?.offsetWidth || 160;
      const height = panel?.offsetHeight || 48;
      const placement = computeClampedPointPlacement(point, width, height, viewport);

      setStyle({
        position: "fixed",
        zIndex: 1300,
        top: placement.top,
        left: placement.left,
        right: "auto",
        bottom: "auto",
        transformOrigin: placement.transformOrigin,
      });
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [active, point, panelRef]);

  return style ?? estimatedStyle;
}

/** @deprecated Use useClampedMenuPanelStyle — kept for tests/import stability. */
export function zoomAnchoredMenuPanelStyle(
  anchor: MenuAnchorRect,
  variant: "floating" | "embedded",
): CSSProperties {
  const placement = computeClampedMenuPlacement(
    anchor,
    ESTIMATED_PANEL_WIDTH,
    ESTIMATED_PANEL_HEIGHT,
    variant,
  );
  return {
    position: "fixed",
    zIndex: 1500,
    pointerEvents: "auto",
    top: placement.top,
    left: placement.left,
    right: "auto",
    bottom: "auto",
    transformOrigin: placement.transformOrigin,
  };
}
