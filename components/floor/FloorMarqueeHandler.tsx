"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { isFloorSpaceHeld } from "@/lib/floor-space-pan";
import { isMarqueeModifier } from "@/lib/selection-modifiers";
import { objectsInMarquee, type ScreenRect } from "@/lib/marquee-select";
import { applyOrbitInteraction } from "@/lib/floor-orbit-controls";

const MARQUEE_SLOP_PX = 8;

interface FloorMarqueeHandlerProps {
  active: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  orbitInteractBlocked: boolean;
  selectableObjects: Array<{ id: string; position_x: number; position_z: number }>;
  onMarqueeChange: (rect: ScreenRect | null) => void;
  onMarqueeComplete: (objectIds: string[]) => void;
  /** По умолчанию true — Cmd/Ctrl+drag. В режиме перемещения — false (просто drag по полу). */
  requireModifier?: boolean;
  /** Не убирать рамку после отпускания кнопки (режим перемещения). */
  keepRectOnComplete?: boolean;
}

export function FloorMarqueeHandler({
  active,
  controlsRef,
  orbitInteractBlocked,
  selectableObjects,
  onMarqueeChange,
  onMarqueeComplete,
  requireModifier = true,
  keepRectOnComplete = false,
}: FloorMarqueeHandlerProps) {
  const { camera, gl, size } = useThree();
  const drawingRef = useRef(false);
  const armedRef = useRef(false);
  const startClientRef = useRef({ x: 0, y: 0 });
  const lastRectRef = useRef<ScreenRect | null>(null);

  useEffect(() => {
    if (!active) {
      drawingRef.current = false;
      armedRef.current = false;
      lastRectRef.current = null;
      onMarqueeChange(null);
      return;
    }

    const canvas = gl.domElement;

    function syncOrbit(enabled: boolean) {
      applyOrbitInteraction(controlsRef.current, {
        rotate: enabled && !orbitInteractBlocked,
        pan: enabled && !orbitInteractBlocked,
      });
    }

    function clientRect(x1: number, y1: number, x2: number, y2: number): ScreenRect {
      return { x1, y1, x2, y2 };
    }

    function marqueeAllowed(e: PointerEvent) {
      return requireModifier ? isMarqueeModifier(e) : true;
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0 || !marqueeAllowed(e) || isFloorSpaceHeld()) return;
      if (e.target !== canvas && !canvas.contains(e.target as Node)) return;

      armedRef.current = true;
      drawingRef.current = false;
      startClientRef.current = { x: e.clientX, y: e.clientY };
      syncOrbit(false);
    }

    function onPointerMove(e: PointerEvent) {
      if (!armedRef.current || e.buttons !== 1) return;

      const dx = e.clientX - startClientRef.current.x;
      const dy = e.clientY - startClientRef.current.y;
      if (!drawingRef.current && Math.hypot(dx, dy) < MARQUEE_SLOP_PX) return;

      drawingRef.current = true;
      const rect = clientRect(
        startClientRef.current.x,
        startClientRef.current.y,
        e.clientX,
        e.clientY,
      );
      lastRectRef.current = rect;
      onMarqueeChange(rect);
    }

    function onPointerUp(e: PointerEvent) {
      if (!armedRef.current) return;

      syncOrbit(true);

      if (drawingRef.current) {
        const r = canvas.getBoundingClientRect();
        const local: ScreenRect = {
          x1: startClientRef.current.x - r.left,
          y1: startClientRef.current.y - r.top,
          x2: e.clientX - r.left,
          y2: e.clientY - r.top,
        };
        const ids = objectsInMarquee(
          selectableObjects,
          camera,
          size.width,
          size.height,
          local,
        );
        onMarqueeComplete(ids);
        if (keepRectOnComplete && lastRectRef.current) {
          onMarqueeChange(lastRectRef.current);
        } else {
          onMarqueeChange(null);
          lastRectRef.current = null;
        }
        e.preventDefault();
        e.stopPropagation();
      } else if (!requireModifier) {
        onMarqueeComplete([]);
        onMarqueeChange(null);
        lastRectRef.current = null;
      }

      armedRef.current = false;
      drawingRef.current = false;
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      syncOrbit(true);
      armedRef.current = false;
      drawingRef.current = false;
      lastRectRef.current = null;
      onMarqueeChange(null);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [
    active,
    camera,
    controlsRef,
    gl.domElement,
    keepRectOnComplete,
    onMarqueeChange,
    onMarqueeComplete,
    orbitInteractBlocked,
    requireModifier,
    selectableObjects,
    size.height,
    size.width,
  ]);

  return null;
}
