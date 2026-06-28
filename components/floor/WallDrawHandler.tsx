"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { isFloorSpaceHeld } from "@/lib/floor-space-pan";
import { useFloorPlaneHit } from "@/lib/floor-stroke-pointer";
import { snapFloorCoord } from "@/lib/floor-grid";
import { isWallInBounds } from "@/lib/office-bounds";
import type { WallStrokePlacement } from "@/lib/wall-draw";
import {
  wallCursorRotationFromCamera,
  wallPreviewAtCursor,
  wallPreviewForStroke,
  wallStrokeFromDrag,
  WALL_MIN_STROKE,
} from "@/lib/wall-draw";
import { WallDrawPreview } from "./WallDrawPreview";

export interface WallDrawState {
  active: boolean;
  drawing: boolean;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  cursorRotationY: number;
  freeAngle: boolean;
}

interface WallDrawActiveProps {
  onStrokeComplete: (stroke: WallStrokePlacement) => void;
  onDrawingChange: (drawing: boolean) => void;
}

function strokeForValidation(state: WallDrawState): WallStrokePlacement | null {
  const len = Math.hypot(state.endX - state.startX, state.endZ - state.startZ);
  if (len >= WALL_MIN_STROKE) {
    return wallStrokeFromDrag(
      state.startX,
      state.startZ,
      state.endX,
      state.endZ,
      state.freeAngle,
    );
  }
  const p = wallPreviewAtCursor(state.startX, state.startZ, state.cursorRotationY);
  return { ...p, length: WALL_MIN_STROKE };
}

function isPreviewValid(state: WallDrawState): boolean {
  if (state.drawing) {
    const stroke = strokeForValidation(state);
    if (!stroke) return false;
    return isWallInBounds(stroke.x, stroke.z, stroke.rotationY, stroke.length);
  }
  const preview = wallPreviewAtCursor(state.endX, state.endZ, state.cursorRotationY);
  return isWallInBounds(preview.x, preview.z, preview.rotationY, preview.length);
}

function previewKeyFromState(
  drawing: boolean,
  freeAngle: boolean,
  start: { x: number; z: number },
  end: { x: number; z: number },
  cursorRotationY: number,
): string {
  if (drawing) {
    return [
      1,
      freeAngle ? 1 : 0,
      snapFloorCoord(start.x),
      snapFloorCoord(start.z),
      Math.round(end.x * 40),
      Math.round(end.z * 40),
      Math.round(cursorRotationY * 80),
    ].join("|");
  }
  return [
    0,
    freeAngle ? 1 : 0,
    snapFloorCoord(end.x),
    snapFloorCoord(end.z),
    Math.round(cursorRotationY * 80),
  ].join("|");
}

export function WallDrawActive({ onStrokeComplete, onDrawingChange }: WallDrawActiveProps) {
  const { camera, raycaster, pointer, gl } = useThree();
  const { hitFromNdc, hitFromClient } = useFloorPlaneHit(camera, raycaster, gl.domElement);

  const [preview, setPreview] = useState<WallDrawState | null>(null);
  const drawingRef = useRef(false);
  const startRef = useRef({ x: 0, z: 0 });
  const endRef = useRef({ x: 0, z: 0 });
  const freeAngleRef = useRef(false);
  const cursorRotationRef = useRef(0);
  const previewKeyRef = useRef("");
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  const onDrawingChangeRef = useRef(onDrawingChange);
  onStrokeCompleteRef.current = onStrokeComplete;
  onDrawingChangeRef.current = onDrawingChange;

  function pushPreview(
    hit: { x: number; z: number },
    cursorRotationY: number,
    force = false,
  ) {
    const key = previewKeyFromState(
      drawingRef.current,
      freeAngleRef.current,
      startRef.current,
      hit,
      cursorRotationY,
    );
    if (!force && key === previewKeyRef.current) return;
    previewKeyRef.current = key;

    setPreview({
      active: true,
      drawing: drawingRef.current,
      startX: startRef.current.x,
      startZ: startRef.current.z,
      endX: hit.x,
      endZ: hit.z,
      cursorRotationY,
      freeAngle: freeAngleRef.current,
    });
  }

  useFrame(() => {
    const cursorRotationY = wallCursorRotationFromCamera(camera.matrix);
    cursorRotationRef.current = cursorRotationY;
    const hit = hitFromNdc(pointer.x, pointer.y);
    if (!hit) return;
    endRef.current = hit;
    pushPreview(hit, cursorRotationY);
  });

  useEffect(() => {
    drawingRef.current = false;
    previewKeyRef.current = "";
    setPreview(null);
    onDrawingChangeRef.current(false);

    const canvas = gl.domElement;

    function finishStroke(
      start: { x: number; z: number },
      end: { x: number; z: number },
      freeAngle: boolean,
    ) {
      const len = Math.hypot(end.x - start.x, end.z - start.z);
      let stroke: WallStrokePlacement | null = null;
      if (len >= WALL_MIN_STROKE) {
        stroke = wallStrokeFromDrag(start.x, start.z, end.x, end.z, freeAngle);
      } else {
        const p = wallPreviewAtCursor(start.x, start.z, cursorRotationRef.current);
        stroke = { ...p, length: WALL_MIN_STROKE };
      }
      if (!stroke || !isWallInBounds(stroke.x, stroke.z, stroke.rotationY, stroke.length)) return;

      previewKeyRef.current = "";
      setPreview(null);
      onStrokeCompleteRef.current(stroke);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") freeAngleRef.current = true;
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") freeAngleRef.current = false;
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0 || isFloorSpaceHeld()) return;
      if (e.target !== canvas && !canvas.contains(e.target as Node)) return;

      freeAngleRef.current = e.shiftKey;
      const hit = hitFromClient(e.clientX, e.clientY);
      if (!hit) return;

      drawingRef.current = true;
      startRef.current = hit;
      endRef.current = hit;
      onDrawingChangeRef.current(true);
      pushPreview(hit, cursorRotationRef.current, true);
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    }

    function onPointerMove(e: PointerEvent) {
      freeAngleRef.current = e.shiftKey;
      if (!drawingRef.current) return;
      const hit = hitFromClient(e.clientX, e.clientY);
      if (!hit) return;
      endRef.current = hit;
      pushPreview(hit, cursorRotationRef.current);
    }

    function onPointerUp(e: PointerEvent) {
      if (!drawingRef.current) return;
      const start = { ...startRef.current };
      const end = { ...endRef.current };
      const freeAngle = e.shiftKey;
      drawingRef.current = false;
      onDrawingChangeRef.current(false);

      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }

      finishStroke(start, end, freeAngle);
      e.preventDefault();
      e.stopPropagation();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [gl.domElement, hitFromClient]);

  if (!preview?.active) return null;

  const mesh = preview.drawing
    ? wallPreviewForStroke(
        preview.startX,
        preview.startZ,
        preview.endX,
        preview.endZ,
        preview.freeAngle,
        preview.cursorRotationY,
      )
    : wallPreviewAtCursor(preview.endX, preview.endZ, preview.cursorRotationY);

  return (
    <WallDrawPreview
      x={mesh.x}
      z={mesh.z}
      rotationY={mesh.rotationY}
      length={mesh.length}
      invalid={!isPreviewValid(preview)}
      drawing={preview.drawing}
      startX={preview.startX}
      startZ={preview.startZ}
    />
  );
}
