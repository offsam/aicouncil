import type { Node } from "@xyflow/react";

function readStyleDimension(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

/** Keep style, width, height, and measured in sync (style is the source of truth). */
export function normalizeNodeDimensions(node: Node): Node {
  const style = (node.style ?? {}) as { width?: number | string; height?: number | string };
  const styleW = readStyleDimension(style.width);
  const styleH = readStyleDimension(style.height);

  const width =
    (typeof node.width === "number" && node.width > 0 ? node.width : undefined) ??
    styleW ??
    (node.measured?.width && node.measured.width > 0 ? node.measured.width : undefined);

  const height =
    (typeof node.height === "number" && node.height > 0 ? node.height : undefined) ??
    styleH ??
    (node.measured?.height && node.measured.height > 0 ? node.measured.height : undefined);

  if (!width || !height) return node;

  if (
    node.width === width &&
    node.height === height &&
    node.measured?.width === width &&
    node.measured?.height === height &&
    styleW === width &&
    styleH === height
  ) {
    return node;
  }

  return {
    ...node,
    width,
    height,
    measured: { width, height },
    style: {
      ...style,
      width,
      height,
    },
  };
}

/** Canonical size from width/style — used to reject bad DOM dimension updates. */
export function canonicalNodeSize(node: Node): { width: number; height: number } | null {
  const style = (node.style ?? {}) as { width?: number | string; height?: number | string };
  const styleW = readStyleDimension(style.width);
  const styleH = readStyleDimension(style.height);
  const width =
    (typeof node.width === "number" && node.width > 0 ? node.width : undefined) ?? styleW;
  const height =
    (typeof node.height === "number" && node.height > 0 ? node.height : undefined) ?? styleH;
  if (!width || !height) return null;
  return { width, height };
}

export function normalizeNodesDimensions(nodes: Node[]): Node[] {
  return nodes.map(normalizeNodeDimensions);
}

export function withNodeDimensions(
  node: Node,
  width: number,
  height: number,
  position?: { x: number; y: number },
): Node {
  return normalizeNodeDimensions({
    ...node,
    ...(position ? { position } : {}),
    width,
    height,
    measured: { width, height },
    style: {
      ...(node.style as object),
      width,
      height,
    },
  });
}
