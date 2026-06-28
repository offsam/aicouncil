"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Handle, useNodeId, useReactFlow, useStore, useUpdateNodeInternals } from "@xyflow/react";
import type { ConnectionHandleSlot } from "@/lib/workspace/connection-handle-slots";
import { DEFAULT_CONNECTION_HANDLES } from "@/lib/workspace/connection-handle-slots";
import {
  nodeAbsolutePosition,
  nodeLocalSize,
  nodeShapeForType,
} from "@/lib/workspace/connection-handle-flow-coords";
import {
  perimeterPercentToPoint,
  pointToPerimeterPercent,
  type HandleNodeShape,
} from "@/lib/workspace/connection-handle-perimeter";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceActionsContext";
import { useWorkspaceLocale } from "@/components/workspace/WorkspaceLocaleContext";

type NodeConnectionHandlesProps = {
  borderColor?: string;
  size?: "sm" | "md";
  slots?: ConnectionHandleSlot[];
  shape?: HandleNodeShape;
  /** Connect mode — show unused ports too. */
  connectActive?: boolean;
  /** While NodeResizer is active — ignore port pointer / RF connect. */
  nodeResizing?: boolean;
  /** @deprecated ignored — ports only show in connect mode */
  hidden?: boolean;
};

const SIZE_CLASS = {
  sm: "workspace-connection-handle--sm",
  md: "workspace-connection-handle--md",
} as const;

const DRAG_THRESHOLD_PX = 4;

function mergeHandleSlots(
  slots: ConnectionHandleSlot[] | undefined,
  includeDefaults: boolean,
): ConnectionHandleSlot[] {
  const byId = new Map<string, ConnectionHandleSlot>();
  if (includeDefaults) {
    for (const slot of DEFAULT_CONNECTION_HANDLES) byId.set(slot.id, slot);
  }
  for (const slot of slots ?? []) byId.set(slot.id, slot);
  return [...byId.values()];
}

function slotStyle(
  slot: ConnectionHandleSlot,
  borderColor: string,
  width: number,
  height: number,
  shape: HandleNodeShape,
) {
  const point = perimeterPercentToPoint(slot.perimeterPercent, width, height, shape);
  return {
    left: `${point.leftPercent}%`,
    top: `${point.topPercent}%`,
    transform: "translate(-50%, -50%)",
    borderColor,
    "--ws-port-glow": borderColor,
  } as React.CSSProperties;
}

export function NodeConnectionHandles({
  borderColor = "#38bdf8",
  size = "md",
  slots,
  shape: shapeProp,
  connectActive = false,
  nodeResizing = false,
}: NodeConnectionHandlesProps) {
  const showAllPorts = connectActive;
  const nodeId = useNodeId();
  const { getNode, screenToFlowPosition } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { repositionConnectionHandle } = useWorkspaceActions();
  const { t } = useWorkspaceLocale();

  const [repositionHandleId, setRepositionHandleId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const pointerRef = useRef<{
    handleId: string;
    isWired: boolean;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const movePercentRef = useRef(0);
  const moveOriginalRef = useRef(0);

  const node = nodeId ? getNode(nodeId) : null;
  const shape = shapeProp ?? nodeShapeForType(node?.type);
  const { width, height } = node ? nodeLocalSize(node) : { width: 120, height: 80 };
  const wiredFromEdges = useStore(
    useCallback(
      (state) => {
        if (!nodeId) return [] as string[];
        const ids = new Set<string>();
        for (const edge of state.edges) {
          if (edge.source === nodeId && edge.sourceHandle) ids.add(edge.sourceHandle);
          if (edge.target === nodeId && edge.targetHandle) ids.add(edge.targetHandle);
        }
        return [...ids];
      },
      [nodeId],
    ),
  );
  const wiredSet = useMemo(() => new Set(wiredFromEdges), [wiredFromEdges]);

  const previewReposition = useCallback(
    (handleId: string, perimeterPercent: number) => {
      if (!nodeId) return;
      movePercentRef.current = perimeterPercent;
      repositionConnectionHandle(nodeId, handleId, perimeterPercent, false);
    },
    [nodeId, repositionConnectionHandle],
  );

  const commitReposition = useCallback(
    (handleId: string) => {
      if (!nodeId) return;
      repositionConnectionHandle(nodeId, handleId, movePercentRef.current, true);
      updateNodeInternals(nodeId);
    },
    [nodeId, repositionConnectionHandle, updateNodeInternals],
  );

  const flowPointFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!nodeId || !node) return null;
      const flow = screenToFlowPosition({ x: clientX, y: clientY });
      const origin = nodeAbsolutePosition(node, getNode);
      return {
        localX: flow.x - origin.x,
        localY: flow.y - origin.y,
      };
    },
    [getNode, node, nodeId, screenToFlowPosition],
  );

  const beginRepositionDrag = useCallback(
    (handleId: string, clientX: number, clientY: number) => {
      const slot = mergeHandleSlots(slots, true).find((s) => s.id === handleId);
      if (!slot) return;

      moveOriginalRef.current = slot.perimeterPercent;
      movePercentRef.current = slot.perimeterPercent;
      setRepositionHandleId(handleId);
      setDraggingId(handleId);

      const pt = flowPointFromPointer(clientX, clientY);
      if (pt) {
        const nextPercent = pointToPerimeterPercent(pt.localX, pt.localY, width, height, shape);
        previewReposition(handleId, nextPercent);
      }
    },
    [flowPointFromPointer, height, previewReposition, shape, slots, width],
  );

  const exitRepositionDrag = useCallback(
    (commit: boolean) => {
      if (!repositionHandleId) return;
      if (commit) commitReposition(repositionHandleId);
      setRepositionHandleId(null);
      setDraggingId(null);
    },
    [commitReposition, repositionHandleId],
  );

  const onHandlePointerDown = useCallback(
    (slot: ConnectionHandleSlot, isWired: boolean, event: React.PointerEvent<HTMLDivElement>) => {
      if (!nodeId || repositionHandleId || nodeResizing) return;
      if (event.button !== 0) return;

      // Connect mode (without Shift): React Flow's native handle mousedown draws the cable.
      if (showAllPorts && !event.shiftKey) {
        return;
      }

      event.stopPropagation();

      pointerRef.current = {
        handleId: slot.id,
        isWired,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [nodeId, nodeResizing, repositionHandleId, showAllPorts],
  );

  const onHandlePointerMove = useCallback(
    (slot: ConnectionHandleSlot, event: React.PointerEvent<HTMLDivElement>) => {
      if (repositionHandleId || nodeResizing) return;

      const ptr = pointerRef.current;
      if (!ptr || ptr.handleId !== slot.id) return;

      const dist = Math.hypot(event.clientX - ptr.startX, event.clientY - ptr.startY);
      if (!ptr.moved && dist >= DRAG_THRESHOLD_PX) {
        ptr.moved = true;
        pointerRef.current = null;
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }

        beginRepositionDrag(slot.id, event.clientX, event.clientY);
      }
    },
    [beginRepositionDrag, nodeResizing, repositionHandleId],
  );

  const onHandlePointerUp = useCallback((slot: ConnectionHandleSlot, event: React.PointerEvent<HTMLDivElement>) => {
    const ptr = pointerRef.current;
    if (ptr?.handleId === slot.id) {
      pointerRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
    setDraggingId(null);
  }, []);

  useEffect(() => {
    if (!repositionHandleId) return;

    const onPointerMove = (event: PointerEvent) => {
      const pt = flowPointFromPointer(event.clientX, event.clientY);
      if (pt) {
        const nextPercent = pointToPerimeterPercent(pt.localX, pt.localY, width, height, shape);
        previewReposition(repositionHandleId, nextPercent);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      exitRepositionDrag(true);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (nodeId) {
          repositionConnectionHandle(
            nodeId,
            repositionHandleId,
            moveOriginalRef.current,
            false,
          );
        }
        exitRepositionDrag(false);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    exitRepositionDrag,
    flowPointFromPointer,
    height,
    nodeId,
    previewReposition,
    repositionConnectionHandle,
    repositionHandleId,
    shape,
    width,
  ]);

  useEffect(() => {
    if (!showAllPorts || !nodeId || nodeResizing) return;
    const frame = requestAnimationFrame(() => updateNodeInternals(nodeId));
    return () => cancelAnimationFrame(frame);
  }, [nodeId, nodeResizing, showAllPorts, slots, updateNodeInternals]);

  const sizeClass = SIZE_CLASS[size];
  const visibleSlots = useMemo(() => {
    if (showAllPorts) {
      return mergeHandleSlots(slots, true);
    }
    return mergeHandleSlots(
      (slots ?? []).filter((slot) => wiredSet.has(slot.id)),
      false,
    );
  }, [showAllPorts, slots, wiredSet]);

  return (
    <>
      {repositionHandleId && (
        <div className="workspace-handle-move-hint nodrag nopan pointer-events-none">
          {t.handleMoveHint}
        </div>
      )}
      {visibleSlots.map((slot) => {
        const point = perimeterPercentToPoint(slot.perimeterPercent, width, height, shape);
        const isWired = wiredSet.has(slot.id);
        const isDormant = !showAllPorts && !isWired;
        const isInteractive = !nodeResizing && showAllPorts;
        const isConnectable = showAllPorts && !nodeResizing;
        return (
          <Handle
            key={slot.id}
            type={slot.type}
            position={point.position}
            id={slot.id}
            isConnectable={isConnectable}
            style={slotStyle(slot, borderColor, width, height, shape)}
            className={`workspace-connection-handle workspace-connection-port nodrag nopan ${sizeClass} workspace-connection-handle--${point.position} workspace-connection-port--${slot.type}${
              isDormant ? " workspace-connection-handle--dormant" : ""
            }${isWired ? " workspace-connection-port--wired" : ""}${
              isInteractive ? " workspace-connection-port--interactive" : ""
            }${
              draggingId === slot.id || repositionHandleId === slot.id
                ? " workspace-connection-handle--dragging"
                : ""
            }${repositionHandleId === slot.id ? " workspace-connection-handle--move-mode" : ""}`}
            data-testid={`workspace-handle-${slot.id}`}
            data-handleid={slot.id}
            onPointerDown={(event) => onHandlePointerDown(slot, isWired, event)}
            onPointerMove={(event) => onHandlePointerMove(slot, event)}
            onPointerUp={(event) => onHandlePointerUp(slot, event)}
          />
        );
      })}
    </>
  );
}
