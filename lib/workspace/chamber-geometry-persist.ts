import type { Node } from "@xyflow/react";
import type { ChamberRow } from "@/lib/office-types";
import { DEFAULT_CHAMBER } from "@/lib/control-defaults";
import { WORKSPACE_UNIT_PX } from "@/lib/workspace/constants";
import { nodeSizePx } from "@/lib/workspace/coords";

export function chamberRowSizePx(row: ChamberRow | undefined): {
  widthPx: number;
  heightPx: number;
} {
  const widthUnits = Number(row?.width) || DEFAULT_CHAMBER.width;
  const depthUnits = Number(row?.depth) || DEFAULT_CHAMBER.depth;
  return {
    widthPx: widthUnits * WORKSPACE_UNIT_PX,
    heightPx: depthUnits * WORKSPACE_UNIT_PX,
  };
}

/** Size for drag-save: never infer from stale node fallback — keep last persisted footprint. */
export function chamberDragSizePx(chamberRow: ChamberRow | undefined): {
  widthPx: number;
  heightPx: number;
} {
  return chamberRowSizePx(chamberRow);
}

/** Size for resize-save: prefer resizer params, then live node, then DB row. */
export function resolveChamberResizeSizePx(
  node: Node | null | undefined,
  chamberRow: ChamberRow | undefined,
  resize?: { widthPx?: number; heightPx?: number },
): { widthPx: number; heightPx: number } {
  if (
    typeof resize?.widthPx === "number" &&
    resize.widthPx > 0 &&
    typeof resize?.heightPx === "number" &&
    resize.heightPx > 0
  ) {
    return { widthPx: resize.widthPx, heightPx: resize.heightPx };
  }

  const fromNode = nodeSizePx(node, 0, 0);
  if (fromNode.width > 0 && fromNode.height > 0) {
    return { widthPx: fromNode.width, heightPx: fromNode.height };
  }

  return chamberRowSizePx(chamberRow);
}

export function resolveChamberResizePosition(
  node: Node | null | undefined,
  resize?: { flowX?: number; flowY?: number },
): { flowX: number; flowY: number } {
  if (typeof resize?.flowX === "number" && typeof resize?.flowY === "number") {
    return { flowX: resize.flowX, flowY: resize.flowY };
  }
  return {
    flowX: node?.position.x ?? 0,
    flowY: node?.position.y ?? 0,
  };
}
