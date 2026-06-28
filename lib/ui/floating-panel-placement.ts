export type ViewportRect = {
  width: number;
  height: number;
};

export type AnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
};

export type FloatingPanelPlacement = {
  top: number;
  left: number;
  transformOrigin: string;
};

const PANEL_MARGIN = 8;
const PANEL_GAP = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getViewportRect(): ViewportRect {
  if (typeof window === "undefined") {
    return { width: 1024, height: 768 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Keep a fixed-position panel fully inside the browser viewport. */
export function computeClampedMenuPlacement(
  anchor: AnchorRect,
  panelWidth: number,
  panelHeight: number,
  variant: "floating" | "embedded",
  viewport: ViewportRect = getViewportRect(),
): FloatingPanelPlacement {
  const maxLeft = Math.max(PANEL_MARGIN, viewport.width - panelWidth - PANEL_MARGIN);
  const maxTop = Math.max(PANEL_MARGIN, viewport.height - panelHeight - PANEL_MARGIN);

  if (variant === "embedded") {
    let top = anchor.bottom + PANEL_GAP;
    let left = anchor.right - panelWidth;
    let transformOrigin = "top right";

    if (top + panelHeight > viewport.height - PANEL_MARGIN) {
      top = anchor.top - panelHeight - PANEL_GAP;
      transformOrigin = "bottom right";
    }

    if (left < PANEL_MARGIN) {
      left = anchor.left;
      transformOrigin = top >= anchor.bottom ? "top left" : "bottom left";
    }

    return {
      top: clamp(top, PANEL_MARGIN, maxTop),
      left: clamp(left, PANEL_MARGIN, maxLeft),
      transformOrigin,
    };
  }

  let left = anchor.left - panelWidth - PANEL_GAP;
  let top = anchor.top;
  let transformOrigin = "right center";

  if (left < PANEL_MARGIN) {
    left = anchor.right + PANEL_GAP;
    transformOrigin = "left center";
  }

  if (top + panelHeight > viewport.height - PANEL_MARGIN) {
    top = anchor.bottom - panelHeight;
    transformOrigin = left >= anchor.right ? "left bottom" : "right bottom";
  }

  return {
    top: clamp(top, PANEL_MARGIN, maxTop),
    left: clamp(left, PANEL_MARGIN, maxLeft),
    transformOrigin,
  };
}

/** Centered hover card above an object; flips below when there is no room on top. */
export function computeTooltipPlacement(
  anchor: AnchorRect,
  panelWidth: number,
  panelHeight: number,
  viewport: ViewportRect = getViewportRect(),
): FloatingPanelPlacement {
  const maxLeft = Math.max(PANEL_MARGIN, viewport.width - panelWidth - PANEL_MARGIN);
  const maxTop = Math.max(PANEL_MARGIN, viewport.height - panelHeight - PANEL_MARGIN);
  const anchorWidth = anchor.right - anchor.left;

  let top = anchor.top - panelHeight - PANEL_GAP;
  let left = anchor.left + anchorWidth / 2 - panelWidth / 2;
  let transformOrigin = "bottom center";

  if (top < PANEL_MARGIN) {
    top = anchor.bottom + PANEL_GAP;
    transformOrigin = "top center";
  }

  return {
    top: clamp(top, PANEL_MARGIN, maxTop),
    left: clamp(left, PANEL_MARGIN, maxLeft),
    transformOrigin,
  };
}

export function computeClampedPointPlacement(
  point: { x: number; y: number },
  panelWidth: number,
  panelHeight: number,
  viewport: ViewportRect = getViewportRect(),
): FloatingPanelPlacement {
  const maxLeft = Math.max(PANEL_MARGIN, viewport.width - panelWidth - PANEL_MARGIN);
  const maxTop = Math.max(PANEL_MARGIN, viewport.height - panelHeight - PANEL_MARGIN);

  let left = point.x;
  let top = point.y;

  if (left + panelWidth > viewport.width - PANEL_MARGIN) {
    left = point.x - panelWidth;
  }
  if (top + panelHeight > viewport.height - PANEL_MARGIN) {
    top = point.y - panelHeight;
  }

  return {
    top: clamp(top, PANEL_MARGIN, maxTop),
    left: clamp(left, PANEL_MARGIN, maxLeft),
    transformOrigin: "top left",
  };
}
