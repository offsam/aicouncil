"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { isFloorSpaceHeld } from "@/lib/floor-space-pan";
import { useFloorPlaneHit } from "@/lib/floor-stroke-pointer";
import { isPositionInBounds } from "@/lib/office-bounds";
import type { OfficeObjectType } from "@/lib/office-types";

interface PlacementClickHandlerProps {
  active: boolean;
  objectType: OfficeObjectType;
  rotationY: number;
  onMove: (x: number, z: number, valid: boolean) => void;
  onConfirm: (x: number, z: number) => void;
}

const CLICK_SLOP_PX = 8;

export function PlacementClickHandler({
  active,
  objectType,
  rotationY,
  onMove,
  onConfirm,
}: PlacementClickHandlerProps) {
  const { camera, raycaster, gl } = useThree();
  const { hitFromClient } = useFloorPlaneHit(camera, raycaster, gl.domElement);

  const onMoveRef = useRef(onMove);
  const onConfirmRef = useRef(onConfirm);
  onMoveRef.current = onMove;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (!active) return;

    const canvas = gl.domElement;
    let downX = 0;
    let downY = 0;
    let moved = false;
    let captured = false;

    function placeAt(clientX: number, clientY: number) {
      const hit = hitFromClient(clientX, clientY);
      if (!hit) return false;
      const valid = isPositionInBounds(hit.x, hit.z, objectType, rotationY);
      onMoveRef.current(hit.x, hit.z, valid);
      if (valid) {
        onConfirmRef.current(hit.x, hit.z);
        return true;
      }
      return false;
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0 || isFloorSpaceHeld()) return;
      if (e.target !== canvas && !canvas.contains(e.target as Node)) return;
      moved = false;
      downX = e.clientX;
      downY = e.clientY;
      captured = true;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    }

    function onPointerMove(e: PointerEvent) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_SLOP_PX) {
        moved = true;
      }
      const hit = hitFromClient(e.clientX, e.clientY);
      if (!hit) return;
      const valid = isPositionInBounds(hit.x, hit.z, objectType, rotationY);
      onMoveRef.current(hit.x, hit.z, valid);
    }

    function onPointerUp(e: PointerEvent) {
      if (e.button !== 0 || isFloorSpaceHeld()) return;
      if (captured && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      captured = false;
      if (moved) return;
      e.preventDefault();
      e.stopPropagation();
      placeAt(e.clientX, e.clientY);
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
  }, [active, gl.domElement, hitFromClient, objectType, rotationY]);

  return null;
}
