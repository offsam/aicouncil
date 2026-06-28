"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  useStore,
  type EdgeProps,
} from "@xyflow/react";
import { ConnectionInfoPopover } from "@/components/workspace/ConnectionInfoPopover";
import { useConnectionDragFollow } from "@/components/workspace/ConnectionDragFollowContext";
import { useWorkspaceOverlayLayer } from "@/components/workspace/WorkspaceOverlayContext";
import { useWorkspaceLocale } from "@/components/workspace/WorkspaceLocaleContext";
import { handleFlowAnchor, nodeLayoutKey } from "@/lib/workspace/connection-handle-flow-coords";
import { cableExitPoint, cableStubPath } from "@/lib/workspace/connection-cable-jack";
import {
  fetchConnectionPopoverData,
  type ConnectionPopoverData,
} from "@/lib/workspace/load-inspector-data";
import {
  formatPermissionLines,
  type ConnectionEdgeData,
} from "@/lib/workspace/workspace-connections";
import {
  displayDotPoints,
  dragOrthogonalSegment,
  dragPolylineVertex,
  expandedSegmentEditHandles,
  extractRoutePathFromPolyline,
  orthogonalizeEditedPolyline,
  polylineToSvgPath,
  resolveOrthogonalPath,
  translateRoutePath,
  vertexEditHandles,
  type FlowPoint,
} from "@/lib/workspace/connection-route-path";

const CABLE_STROKE = "var(--border-soft)";
const CABLE_STROKE_WIDTH = 2;

function segmentDragCursor(orientation: "horizontal" | "vertical"): string {
  return orientation === "horizontal" ? "ns-resize" : "ew-resize";
}

export function ConnectionEdge({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  data,
  selected,
}: EdgeProps) {
  const d = (data ?? {}) as ConnectionEdgeData;
  const { getNode, screenToFlowPosition } = useReactFlow();
  const dragFollow = useConnectionDragFollow();
  const sourceLayoutKey = useStore(
    useCallback(
      (s) => nodeLayoutKey(s.nodeLookup.get(source), (id) => s.nodeLookup.get(id)),
      [source],
    ),
  );
  const targetLayoutKey = useStore(
    useCallback(
      (s) => nodeLayoutKey(s.nodeLookup.get(target), (id) => s.nodeLookup.get(id)),
      [target],
    ),
  );
  const { t } = useWorkspaceLocale();
  const dragOriginRef = useRef<FlowPoint[] | null>(null);
  const dragStartFlowRef = useRef<FlowPoint | null>(null);
  const dragKindRef = useRef<"segment" | "vertex" | null>(null);
  const dragIndexRef = useRef(-1);
  const [dragPolyline, setDragPolyline] = useState<FlowPoint[] | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  const [popoverPinned, setPopoverPinned] = useState(false);
  const [popoverLoading, setPopoverLoading] = useState(false);
  const [popoverError, setPopoverError] = useState<string | null>(null);
  const [popoverData, setPopoverData] = useState<ConnectionPopoverData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fetchGenRef = useRef(0);

  useWorkspaceOverlayLayer(id, popoverPinned);

  const isEditing = Boolean(selected || dragPolyline);

  const sourceAnchor = useMemo(() => {
    const node = getNode(source);
    if (!node) return null;
    return handleFlowAnchor(node, sourceHandleId, getNode);
  }, [getNode, source, sourceHandleId, sourceLayoutKey]);

  const targetAnchor = useMemo(() => {
    const node = getNode(target);
    if (!node) return null;
    return handleFlowAnchor(node, targetHandleId, getNode);
  }, [getNode, target, targetHandleId, targetLayoutKey]);

  const sourceExit = useMemo(
    () => (sourceAnchor ? cableExitPoint(sourceAnchor) : { x: sourceX, y: sourceY }),
    [sourceAnchor, sourceX, sourceY],
  );

  const targetExit = useMemo(
    () => (targetAnchor ? cableExitPoint(targetAnchor) : { x: targetX, y: targetY }),
    [targetAnchor, targetX, targetY],
  );

  const effectiveRoutePath = useMemo(() => {
    if (!d.routePath || !dragFollow) return d.routePath;
    const affected =
      dragFollow.movingNodeIds.has(source) && dragFollow.movingNodeIds.has(target);
    if (!affected) return d.routePath;
    return translateRoutePath(d.routePath, dragFollow.dx, dragFollow.dy);
  }, [d.routePath, dragFollow, source, target]);

  const resolved = useMemo(
    () =>
      resolveOrthogonalPath(
        sourceExit.x,
        sourceExit.y,
        targetExit.x,
        targetExit.y,
        d.laneOffset ?? 0,
        effectiveRoutePath,
      ),
    [sourceExit.x, sourceExit.y, targetExit.x, targetExit.y, d.laneOffset, effectiveRoutePath],
  );

  const polyline = dragPolyline ?? resolved.polyline;
  const edgePath = polylineToSvgPath(polyline);
  const labelX = resolved.labelX;
  const labelY = resolved.labelY;
  const dotPoints = displayDotPoints(polyline, isEditing);

  const routeHighlighted = d.highlighted && !isEditing;
  const showTooltip = routeHighlighted && !popoverPinned;
  const signalPulse = d.signalPulse;
  const signalSuccess = d.signalTone === "success";

  const tronStroke = signalSuccess ? "#22c55e" : "#facc15";
  const tronCore = "var(--text-main)";
  const stroke = signalPulse || d.signalLit
    ? tronStroke
      : isEditing
      ? "var(--warning)"
      : routeHighlighted
        ? "var(--accent-cyan)"
        : (style?.stroke as string) ?? CABLE_STROKE;
  const strokeWidth = signalPulse
    ? 2.25
    : isEditing
      ? 2.25
      : routeHighlighted
        ? 2.25
        : Number(style?.strokeWidth ?? CABLE_STROKE_WIDTH);
  const outerStroke = "var(--bg-main)";
  const outerStrokeWidth = Math.max(3, strokeWidth + 2.5);

  const pipeFilter =
    signalPulse || d.signalLit
      ? signalSuccess
        ? "drop-shadow(0 0 8px rgba(34, 197, 94, 0.45))"
        : "drop-shadow(0 0 8px rgba(250, 204, 21, 0.35))"
      : isEditing
        ? "drop-shadow(0 0 10px rgba(245, 158, 11, 0.65))"
        : routeHighlighted
          ? "drop-shadow(0 0 10px rgba(56, 213, 255, 0.55))"
          : undefined;

  const sourceStub =
    sourceAnchor && polyline.length > 0
      ? cableStubPath(sourceAnchor, polyline[0]!)
      : null;
  const targetStub =
    targetAnchor && polyline.length > 0
      ? cableStubPath(targetAnchor, polyline[polyline.length - 1]!)
      : null;

  const loadPopoverData = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    setPopoverLoading(true);
    setPopoverError(null);
    try {
      const officeId = d.officeId ?? "";
      const result = await fetchConnectionPopoverData(officeId, d.connectionId);
      if (gen !== fetchGenRef.current) return;
      setPopoverData(result);
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      setPopoverError(err instanceof Error ? err.message : "Load failed");
      setPopoverData(null);
    } finally {
      if (gen === fetchGenRef.current) setPopoverLoading(false);
    }
  }, [d.connectionId, d.officeId]);

  const showPopover = useCallback(() => {
    setPopoverPinned(true);
    void loadPopoverData();
  }, [loadPopoverData]);

  const hidePopover = useCallback(() => {
    setPopoverPinned(false);
    setPopoverError(null);
    fetchGenRef.current += 1;
  }, []);

  const handleDelete = useCallback(async () => {
    if (!d.onDeleteConnection) return;
    if (!window.confirm(t.connectionDeleteConfirm)) return;
    setDeleting(true);
    try {
      await d.onDeleteConnection(d.connectionId);
      hidePopover();
    } catch (err) {
      setPopoverError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [d, hidePopover, t.connectionDeleteConfirm]);

  useEffect(() => {
    if (!popoverPinned) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") hidePopover();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hidePopover, popoverPinned]);

  const finishDrag = useCallback(
    (rawPolyline: FlowPoint[]) => {
      const normalized = orthogonalizeEditedPolyline(rawPolyline);
      const routePath = extractRoutePathFromPolyline(normalized);
      d.onRoutePathChange?.(d.connectionId, routePath);
      setDragPolyline(null);
      dragOriginRef.current = null;
      dragStartFlowRef.current = null;
      dragKindRef.current = null;
      dragIndexRef.current = -1;
      setActiveHandle(null);
    },
    [d],
  );

  const beginDrag = useCallback(
    (kind: "segment" | "vertex", index: number, event: React.PointerEvent<SVGCircleElement>) => {
      event.stopPropagation();
      event.preventDefault();
      dragKindRef.current = kind;
      dragIndexRef.current = index;
      dragOriginRef.current = resolved.polyline.map((p) => ({ ...p }));
      dragStartFlowRef.current = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setDragPolyline(resolved.polyline.map((p) => ({ ...p })));
      setActiveHandle(`${kind}-${index}`);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [resolved.polyline, screenToFlowPosition],
  );

  const onHandlePointerMove = useCallback(
    (event: React.PointerEvent<SVGCircleElement>) => {
      if (!dragStartFlowRef.current || !dragOriginRef.current || dragIndexRef.current < 0) return;
      const current = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const delta = {
        x: current.x - dragStartFlowRef.current.x,
        y: current.y - dragStartFlowRef.current.y,
      };
      if (dragKindRef.current === "segment") {
        setDragPolyline(
          dragOrthogonalSegment(dragOriginRef.current, dragIndexRef.current, delta),
        );
      } else if (dragKindRef.current === "vertex") {
        setDragPolyline(
          dragPolylineVertex(dragOriginRef.current, dragIndexRef.current, delta),
        );
      }
    },
    [screenToFlowPosition],
  );

  const onHandlePointerUp = useCallback(
    (event: React.PointerEvent<SVGCircleElement>) => {
      if (dragIndexRef.current < 0) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      finishDrag(dragPolyline ?? resolved.polyline);
    },
    [dragPolyline, finishDrag, resolved.polyline],
  );

  const segmentHandles = useMemo(
    () => (isEditing ? expandedSegmentEditHandles(polyline) : []),
    [isEditing, polyline],
  );

  const cornerHandles = useMemo(
    () => (isEditing ? vertexEditHandles(polyline) : []),
    [isEditing, polyline],
  );

  const onEdgeBodyDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      if (d.onOpenInspector) {
        d.onOpenInspector();
        return;
      }
      showPopover();
    },
    [d, showPopover],
  );

  const onEdgeBodyClick = useCallback(
    (event: React.MouseEvent) => {
      if (isEditing) return;
      event.stopPropagation();
      d.onSelectEdge?.();
    },
    [d, isEditing],
  );

  const edgeOpacity = d.dimmed ? 0.62 : 1;
  const coreOpacity = signalPulse ? (d.dimmed ? 0.15 : 0.92) : 0;
  const dotOpacity = d.dimmed ? 0.15 : (signalPulse ? 1 : isEditing ? 0.7 : 0.85);

  return (
    <>
      {sourceStub && (
        <>
          <path
            d={sourceStub}
            fill="none"
            className="workspace-connection-pipe-outer"
            stroke={outerStroke}
            strokeWidth={strokeWidth + 8}
            strokeLinecap="round"
            pointerEvents="none"
            opacity={edgeOpacity}
          />
          <path
            d={sourceStub}
            fill="none"
            className="workspace-connection-pipe workspace-connection-stub"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            pointerEvents="none"
            opacity={edgeOpacity}
          />
          <path
            d={sourceStub}
            fill="none"
            className="workspace-connection-pipe-core workspace-connection-stub"
            stroke={tronCore}
            strokeWidth={Math.max(1.5, strokeWidth - 2)}
            strokeLinecap="round"
            pointerEvents="none"
            opacity={coreOpacity}
          />
        </>
      )}
      {targetStub && (
        <>
          <path
            d={targetStub}
            fill="none"
            className="workspace-connection-pipe-outer"
            stroke={outerStroke}
            strokeWidth={strokeWidth + 8}
            strokeLinecap="round"
            pointerEvents="none"
            opacity={edgeOpacity}
          />
          <path
            d={targetStub}
            fill="none"
            className="workspace-connection-pipe workspace-connection-stub"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            pointerEvents="none"
            opacity={edgeOpacity}
          />
          <path
            d={targetStub}
            fill="none"
            className="workspace-connection-pipe-core workspace-connection-stub"
            stroke={tronCore}
            strokeWidth={Math.max(1.5, strokeWidth - 2)}
            strokeLinecap="round"
            pointerEvents="none"
            opacity={coreOpacity}
          />
        </>
      )}
      <BaseEdge
        id={`${id}-pipe-outer`}
        path={edgePath}
        interactionWidth={0}
        className="workspace-connection-pipe-outer"
          style={{
            stroke: outerStroke,
          strokeWidth: outerStrokeWidth,
          opacity: edgeOpacity,
          strokeLinejoin: "round",
          strokeLinecap: "round",
          pointerEvents: "none",
        }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={0}
        className={`workspace-connection-pipe${
          signalPulse ? " workspace-connection-signal-pulse workspace-connection-route-lit" : ""
        }${isEditing ? " workspace-connection-editing" : ""}`}
        style={{
          stroke,
          strokeWidth,
          opacity: edgeOpacity,
          transition: "none",
          strokeLinejoin: "round",
          strokeLinecap: "round",
          filter: pipeFilter,
        }}
      />
      <BaseEdge
        id={`${id}-pipe-core`}
        path={edgePath}
        interactionWidth={0}
        className="workspace-connection-pipe-core"
        style={{
          stroke: tronCore,
          strokeWidth: Math.max(1.5, strokeWidth - 2),
          opacity: coreOpacity,
          strokeLinejoin: "round",
          strokeLinecap: "round",
          pointerEvents: "none",
        }}
      />
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={24}
        className="react-flow__edge-interaction workspace-connection-hit"
        pointerEvents={isEditing ? "none" : "stroke"}
        onClick={onEdgeBodyClick}
        onDoubleClick={onEdgeBodyDoubleClick}
      />
      {signalPulse && (
        <BaseEdge
          id={`${id}-signal`}
          path={edgePath}
          interactionWidth={0}
          className="workspace-connection-signal-overlay workspace-connection-route-lit"
          style={{
            stroke: tronStroke,
            strokeWidth: 2.25,
            opacity: d.dimmed ? 0.15 : 0.95,
            pointerEvents: "none",
          }}
        />
      )}
      {dotPoints.map((pt, i) => (
        <circle
          key={`${id}-dot-${i}`}
          cx={pt.x}
          cy={pt.y}
          r={isEditing ? 3 : signalPulse ? 4.5 : 3.5}
          className={`workspace-connection-flow-dot${
            signalPulse ? " workspace-connection-signal-dot" : ""
          }${isEditing ? " workspace-connection-edit-dot" : ""}`}
          fill={stroke}
          opacity={dotOpacity}
          pointerEvents="none"
        />
      ))}
      {isEditing &&
        segmentHandles.map(({ segmentIndex, x, y, orientation }) => {
          const guideLen = 18;
          const isHorizontal = orientation === "horizontal";
          return (
            <g key={`${id}-seg-group-${segmentIndex}`}>
              <line
                x1={isHorizontal ? x : x - guideLen}
                y1={isHorizontal ? y - guideLen : y}
                x2={isHorizontal ? x : x + guideLen}
                y2={isHorizontal ? y + guideLen : y}
                className="workspace-connection-drag-guide"
                pointerEvents="none"
              />
              <circle
                cx={x}
                cy={y}
                r={8}
                className={`workspace-connection-segment-handle nodrag nopan workspace-connection-segment-handle--${orientation}${
                  activeHandle === `segment-${segmentIndex}`
                    ? " workspace-connection-segment-handle--dragging"
                    : ""
                }`}
                data-testid={`workspace-edge-segment-handle-${d.connectionId}-${segmentIndex}`}
                data-orientation={orientation}
                fill="#1c1917"
                stroke="#fcd34d"
                strokeWidth={2}
                style={{
                  cursor: segmentDragCursor(orientation),
                  pointerEvents: "all",
                }}
                onPointerDown={(e) => beginDrag("segment", segmentIndex, e)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
              />
            </g>
          );
        })}
      {isEditing &&
        cornerHandles.map(({ vertexIndex, x, y }) => (
          <circle
            key={`${id}-vtx-${vertexIndex}`}
            cx={x}
            cy={y}
            r={6}
            className={`workspace-connection-vertex-handle nodrag nopan${
              activeHandle === `vertex-${vertexIndex}`
                ? " workspace-connection-vertex-handle--dragging"
                : ""
            }`}
            data-testid={`workspace-edge-vertex-handle-${d.connectionId}-${vertexIndex}`}
            fill="#022c22"
            stroke="#2dd4bf"
            strokeWidth={2}
            style={{ cursor: "grab", pointerEvents: "all" }}
            onPointerDown={(e) => beginDrag("vertex", vertexIndex, e)}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
          />
        ))}
      {showTooltip && d.permissions && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded border border-stone-600 bg-stone-900/95 px-2 py-1.5 text-[10px] text-stone-200 shadow-lg"
            style={{
              transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 8}px)`,
            }}
          >
            <div className="mb-0.5 font-medium text-stone-400">
              {d.sourceName} ↔ {d.targetName}
            </div>
            {formatPermissionLines(d.permissions).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
      {popoverPinned && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <ConnectionInfoPopover
              data={popoverData}
              edgeData={d}
              loading={popoverLoading}
              error={popoverError}
              pinned={popoverPinned}
              onClose={hidePopover}
              onDelete={() => void handleDelete()}
              deleting={deleting}
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
