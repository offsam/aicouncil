"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { isFloorSpaceHeld } from "@/lib/floor-space-pan";
import { useFloorPlaneHit } from "@/lib/floor-stroke-pointer";
import { snapFloorCoord } from "@/lib/floor-grid";
import { isRoomInBounds } from "@/lib/office-bounds";
import {
  rectFromDrag,
  roomPreviewAtCursor,
  ROOM_MIN_STROKE,
  type SnappedRect,
} from "@/lib/floor-grid";
import { RoomFloorMesh } from "./RoomFloorMesh";

export interface RoomDrawState {
  active: boolean;
  drawing: boolean;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
}

interface RoomDrawActiveProps {
  onStrokeComplete: (rect: SnappedRect) => void;
  onDrawingChange: (drawing: boolean) => void;
  isDark: boolean;
}

/** Рисование помещения — превью живёт только внутри Canvas, без re-render всей страницы. */
export function RoomDrawActive({
  onStrokeComplete,
  onDrawingChange,
  isDark,
}: RoomDrawActiveProps) {
  const { camera, raycaster, pointer, gl } = useThree();
  const { hitFromNdc, hitFromClient } = useFloorPlaneHit(camera, raycaster, gl.domElement);

  const [preview, setPreview] = useState<RoomDrawState | null>(null);
  const drawingRef = useRef(false);
  const startRef = useRef({ x: 0, z: 0 });
  const endRef = useRef({ x: 0, z: 0 });
  const previewKeyRef = useRef("");
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  const onDrawingChangeRef = useRef(onDrawingChange);
  onStrokeCompleteRef.current = onStrokeComplete;
  onDrawingChangeRef.current = onDrawingChange;

  useFrame(() => {
    const hit = hitFromNdc(pointer.x, pointer.y);
    if (!hit) return;
    endRef.current = hit;

    const sx = snapFloorCoord(startRef.current.x);
    const sz = snapFloorCoord(startRef.current.z);
    const ex = snapFloorCoord(hit.x);
    const ez = snapFloorCoord(hit.z);

    const key = [drawingRef.current ? 1 : 0, sx, sz, ex, ez].join("|");
    if (key === previewKeyRef.current) return;
    previewKeyRef.current = key;

    setPreview({
      active: true,
      drawing: drawingRef.current,
      startX: startRef.current.x,
      startZ: startRef.current.z,
      endX: hit.x,
      endZ: hit.z,
    });
  });

  useEffect(() => {
    drawingRef.current = false;
    previewKeyRef.current = "";
    setPreview(null);
    onDrawingChangeRef.current(false);

    const canvas = gl.domElement;

    function finishStroke(start: { x: number; z: number }, end: { x: number; z: number }) {
      const len = Math.hypot(end.x - start.x, end.z - start.z);
      const rect =
        len >= ROOM_MIN_STROKE
          ? rectFromDrag(start.x, start.z, end.x, end.z)
          : roomPreviewAtCursor(start.x, start.z);
      if (!isRoomInBounds(rect.centerX, rect.centerZ, rect.width, rect.depth)) return;

      previewKeyRef.current = "";
      setPreview(null);
      onStrokeCompleteRef.current(rect);
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0 || isFloorSpaceHeld()) return;
      if (e.target !== canvas && !canvas.contains(e.target as Node)) return;

      const hit = hitFromClient(e.clientX, e.clientY);
      if (!hit) return;

      drawingRef.current = true;
      startRef.current = hit;
      endRef.current = hit;
      onDrawingChangeRef.current(true);
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    }

    function onPointerMove(e: PointerEvent) {
      if (!drawingRef.current) return;
      const hit = hitFromClient(e.clientX, e.clientY);
      if (hit) endRef.current = hit;
    }

    function onPointerUp(e: PointerEvent) {
      if (!drawingRef.current) return;
      const start = { ...startRef.current };
      const end = { ...endRef.current };
      drawingRef.current = false;
      onDrawingChangeRef.current(false);

      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }

      finishStroke(start, end);
      e.preventDefault();
      e.stopPropagation();
    }

    canvas.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [gl.domElement, hitFromClient]);

  if (!preview?.active) return null;

  const rect = preview.drawing
    ? rectFromDrag(preview.startX, preview.startZ, preview.endX, preview.endZ)
    : roomPreviewAtCursor(preview.endX, preview.endZ);
  const invalid = !isRoomInBounds(rect.centerX, rect.centerZ, rect.width, rect.depth);

  return (
    <group position={[rect.centerX, 0, rect.centerZ]}>
      <RoomFloorMesh
        width={rect.width}
        depth={rect.depth}
        isDark={isDark}
        preview
        invalid={invalid}
        interactive={false}
      />
    </group>
  );
}
