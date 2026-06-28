"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Vector3 } from "three";
import { isFloorSpaceHeld, setFloorSpaceHeld } from "@/lib/floor-space-pan";

interface SpacePanControlsProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  enabled: boolean;
}

export function SpacePanControls({ controlsRef, enabled }: SpacePanControlsProps) {
  const { gl, camera } = useThree();
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const axisRef = useRef(new Vector3());
  const panOffsetRef = useRef(new Vector3());

  useEffect(() => {
    if (!enabled) return;

    const canvas = gl.domElement;

    function isTypingTarget(target: EventTarget | null) {
      return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      );
    }

    function syncOrbitEnabled() {
      const controls = controlsRef.current;
      if (!controls) return;
      controls.enabled = !isFloorSpaceHeld() && !draggingRef.current;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat || isTypingTarget(e.target)) return;
      e.preventDefault();
      setFloorSpaceHeld(true);
      canvas.style.cursor = draggingRef.current ? "grabbing" : "grab";
      syncOrbitEnabled();
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      setFloorSpaceHeld(false);
      draggingRef.current = false;
      canvas.style.cursor = "";
      syncOrbitEnabled();
    }

    /** Same screen-space pan as OrbitControls (RMB), flattened to the floor plane. */
    function applyPan(dx: number, dy: number) {
      const controls = controlsRef.current;
      if (!controls) return;

      const targetDistance = camera.position.distanceTo(controls.target);
      const height = Math.max(canvas.clientHeight, 1);
      const panX = (2 * dx * targetDistance) / height;
      const panY = (2 * dy * targetDistance) / height;

      const offset = panOffsetRef.current.set(0, 0, 0);

      axisRef.current.setFromMatrixColumn(camera.matrix, 0);
      offset.addScaledVector(axisRef.current, -panX);

      axisRef.current.setFromMatrixColumn(camera.matrix, 1);
      offset.addScaledVector(axisRef.current, panY);

      offset.y = 0;

      camera.position.add(offset);
      controls.target.add(offset);
      controls.update();
    }

    function onPointerDown(e: PointerEvent) {
      if (!isFloorSpaceHeld() || e.button !== 0) return;
      draggingRef.current = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = "grabbing";
      if (controlsRef.current) controlsRef.current.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    }

    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (dx !== 0 || dy !== 0) applyPan(dx, dy);
      e.preventDefault();
    }

    function endPan(e: PointerEvent) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      canvas.style.cursor = isFloorSpaceHeld() ? "grab" : "";
      syncOrbitEnabled();
    }

    function onBlur() {
      setFloorSpaceHeld(false);
      draggingRef.current = false;
      canvas.style.cursor = "";
      syncOrbitEnabled();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPan);
    canvas.addEventListener("pointercancel", endPan);

    return () => {
      setFloorSpaceHeld(false);
      draggingRef.current = false;
      canvas.style.cursor = "";
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPan);
      canvas.removeEventListener("pointercancel", endPan);
    };
  }, [camera, controlsRef, enabled, gl]);

  return null;
}
