import type { ConnectionRoutePath } from "@/lib/office-types";

export type FlowPoint = { x: number; y: number };

export type OrthogonalPathResult = {
  polyline: FlowPoint[];
  pathD: string;
  labelX: number;
  labelY: number;
  dotPoints: FlowPoint[];
  /** Segment index -> draggable (interior segments only) */
  draggableSegments: number[];
};

function nearlyEqual(a: number, b: number, eps = 0.5): boolean {
  return Math.abs(a - b) <= eps;
}

/** Insert corners so consecutive points form axis-aligned segments. */
export function orthogonalizePolyline(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  interior: FlowPoint[],
): FlowPoint[] {
  const raw: FlowPoint[] = [{ x: sourceX, y: sourceY }, ...interior, { x: targetX, y: targetY }];
  if (raw.length <= 2) return raw;

  const out: FlowPoint[] = [raw[0]];
  for (let i = 1; i < raw.length; i += 1) {
    const prev = out[out.length - 1];
    const next = raw[i];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    if (nearlyEqual(dx, 0) || nearlyEqual(dy, 0)) {
      out.push(next);
      continue;
    }
    out.push({ x: next.x, y: prev.y });
    if (!nearlyEqual(out[out.length - 1].x, next.x) || !nearlyEqual(out[out.length - 1].y, next.y)) {
      out.push(next);
    }
  }

  return simplifyCollinear(out);
}

function simplifyCollinear(points: FlowPoint[]): FlowPoint[] {
  if (points.length <= 2) return points;
  const out: FlowPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const collinearH = nearlyEqual(a.y, b.y) && nearlyEqual(b.y, c.y);
    const collinearV = nearlyEqual(a.x, b.x) && nearlyEqual(b.x, c.x);
    if (!collinearH && !collinearV) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

function autoInteriorPoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  laneOffset: number,
): FlowPoint[] {
  const midX = sourceX + (targetX - sourceX) / 2 + laneOffset;
  return [
    { x: midX, y: sourceY },
    { x: midX, y: targetY },
  ];
}

export function polylineToSvgPath(points: FlowPoint[]): string {
  if (points.length === 0) return "";
  const r = 12;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (!next) {
      d += ` L ${curr.x} ${curr.y}`;
      break;
    }

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const corner =
      Math.min(r, Math.abs(dx1) / 2, Math.abs(dy1) / 2, Math.abs(dx2) / 2, Math.abs(dy2) / 2) || 0;

    if (corner <= 0.5) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const sx = curr.x - Math.sign(dx1) * corner;
    const sy = curr.y - Math.sign(dy1) * corner;
    const ex = curr.x + Math.sign(dx2) * corner;
    const ey = curr.y + Math.sign(dy2) * corner;
    d += ` L ${sx} ${sy} Q ${curr.x} ${curr.y} ${ex} ${ey}`;
  }
  return d;
}

function dotPointsFromPolyline(points: FlowPoint[], expanded = false): FlowPoint[] {
  const dots: FlowPoint[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    dots.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return expanded ? dots : dots.slice(0, 3);
}

export type SegmentEditHandle = {
  segmentIndex: number;
  x: number;
  y: number;
  orientation: "horizontal" | "vertical";
};
export type VertexEditHandle = { vertexIndex: number; x: number; y: number };

/** All interior segment midpoints — shown when the cable is selected for editing. */
export function expandedSegmentEditHandles(polyline: FlowPoint[]): SegmentEditHandle[] {
  const handles: SegmentEditHandle[] = [];
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const a = polyline[i];
    const b = polyline[i + 1];
    handles.push({
      segmentIndex: i,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      orientation: segmentOrientation(a, b),
    });
  }
  return handles;
}

/** Corner points (excluding source/target anchors) for cable reshaping. */
export function vertexEditHandles(polyline: FlowPoint[]): VertexEditHandle[] {
  const handles: VertexEditHandle[] = [];
  for (let i = 1; i < polyline.length - 1; i += 1) {
    handles.push({ vertexIndex: i, x: polyline[i].x, y: polyline[i].y });
  }
  return handles;
}

export function translateRoutePath(
  routePath: ConnectionRoutePath | null | undefined,
  dx: number,
  dy: number,
): ConnectionRoutePath | null {
  if (!routePath?.points?.length || routePath.version !== 1) return routePath ?? null;
  if (dx === 0 && dy === 0) return routePath;
  return {
    version: 1,
    points: routePath.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  };
}

export function resolveOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  laneOffset = 0,
  routePath?: ConnectionRoutePath | null,
): OrthogonalPathResult {
  const interior =
    routePath?.points?.length && routePath.version === 1
      ? routePath.points
      : autoInteriorPoints(sourceX, sourceY, targetX, targetY, laneOffset);

  const polyline = orthogonalizePolyline(sourceX, sourceY, targetX, targetY, interior);
  const pathD = polylineToSvgPath(polyline);
  const mid = polyline[Math.floor(polyline.length / 2)] ?? {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2,
  };

  const draggableSegments: number[] = [];
  for (let i = 0; i < polyline.length - 1; i += 1) {
    if (i === 0 && polyline.length <= 3) continue;
    if (i >= polyline.length - 2 && polyline.length <= 3) continue;
    draggableSegments.push(i);
  }
  if (polyline.length >= 4) {
    for (let i = 1; i < polyline.length - 2; i += 1) {
      if (!draggableSegments.includes(i)) draggableSegments.push(i);
    }
  }

  return {
    polyline,
    pathD,
    labelX: mid.x,
    labelY: mid.y,
    dotPoints: dotPointsFromPolyline(polyline, false),
    draggableSegments,
  };
}

export function displayDotPoints(polyline: FlowPoint[], expanded: boolean): FlowPoint[] {
  return dotPointsFromPolyline(polyline, expanded);
}

export function extractRoutePathFromPolyline(polyline: FlowPoint[]): ConnectionRoutePath | null {
  if (polyline.length <= 2) return null;
  const interior = simplifyCollinear(polyline.slice(1, -1));
  if (interior.length === 0) return null;
  return { version: 1, points: interior };
}

export function segmentOrientation(a: FlowPoint, b: FlowPoint): "horizontal" | "vertical" {
  return nearlyEqual(a.y, b.y) ? "horizontal" : "vertical";
}

/** Drag an interior segment; keeps 90° routing. */
export function dragOrthogonalSegment(
  polyline: FlowPoint[],
  segmentIndex: number,
  delta: FlowPoint,
): FlowPoint[] {
  if (segmentIndex < 0 || segmentIndex >= polyline.length - 1) return polyline;

  const a = polyline[segmentIndex];
  const b = polyline[segmentIndex + 1];
  const orientation = segmentOrientation(a, b);
  const next = polyline.map((p) => ({ ...p }));

  if (orientation === "horizontal") {
    const dy = delta.y;
    next[segmentIndex] = { x: a.x, y: a.y + dy };
    next[segmentIndex + 1] = { x: b.x, y: b.y + dy };
  } else {
    const dx = delta.x;
    next[segmentIndex] = { x: a.x + dx, y: a.y };
    next[segmentIndex + 1] = { x: b.x + dx, y: b.y };
  }

  return simplifyCollinear(next);
}

/** Move an interior corner while editing a cable path. */
export function dragPolylineVertex(
  polyline: FlowPoint[],
  vertexIndex: number,
  delta: FlowPoint,
): FlowPoint[] {
  if (vertexIndex <= 0 || vertexIndex >= polyline.length - 1) return polyline;
  return polyline.map((p, i) =>
    i === vertexIndex ? { x: p.x + delta.x, y: p.y + delta.y } : { ...p },
  );
}

/** Re-orthogonalize after a corner drag so segments stay at 90°. */
export function orthogonalizeEditedPolyline(polyline: FlowPoint[]): FlowPoint[] {
  if (polyline.length < 2) return polyline;
  const source = polyline[0];
  const target = polyline[polyline.length - 1];
  const interior = polyline.slice(1, -1);
  return orthogonalizePolyline(source.x, source.y, target.x, target.y, interior);
}

/** Legacy wrapper used by tests — auto path with lane offset. */
export function getOrthogonalEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  laneOffset = 0,
  routePath?: ConnectionRoutePath | null,
): [path: string, labelX: number, labelY: number, dotPoints: FlowPoint[]] {
  const resolved = resolveOrthogonalPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    laneOffset,
    routePath,
  );
  return [resolved.pathD, resolved.labelX, resolved.labelY, resolved.dotPoints];
}

/** Spread parallel connections between the same endpoints (secondary offset). */
export function assignConnectionLaneOffsets(
  connections: Array<{ id: string; source_entity_id: string; target_entity_id: string }>,
  laneSpacing = 28,
): Map<string, number> {
  const groups = new Map<string, string[]>();

  for (const conn of connections) {
    const key = [conn.source_entity_id, conn.target_entity_id].sort().join("|");
    const list = groups.get(key) ?? [];
    list.push(conn.id);
    groups.set(key, list);
  }

  const offsets = new Map<string, number>();
  for (const ids of groups.values()) {
    const n = ids.length;
    ids.forEach((id, i) => {
      offsets.set(id, (i - (n - 1) / 2) * laneSpacing);
    });
  }
  return offsets;
}
