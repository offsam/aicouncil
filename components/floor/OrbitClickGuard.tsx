"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Vector2 } from "three";
import { isFloorSpaceHeld } from "@/lib/floor-space-pan";
import { isMarqueeModifier } from "@/lib/selection-modifiers";
import { isOrbitPauseTarget } from "@/lib/floor-orbit-guard";
import { applyOrbitInteraction } from "@/lib/floor-orbit-controls";

interface OrbitClickGuardProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  enabled: boolean;
  skipInteraction: boolean;
}

const ndc = new Vector2();

export function OrbitClickGuard({
  controlsRef,
  enabled,
  skipInteraction,
}: OrbitClickGuardProps) {
  const { gl, camera, scene, raycaster } = useThree();
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!enabled || skipInteraction) return;

    const canvas = gl.domElement;

    function syncOrbit(on: boolean) {
      applyOrbitInteraction(controlsRef.current, { rotate: on, pan: on });
    }

    function onPointerDownCapture(e: PointerEvent) {
      if (e.button !== 0 || isMarqueeModifier(e) || isFloorSpaceHeld()) return;
      if (e.target !== canvas && !canvas.contains(e.target as Node)) return;

      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      const hit = hits.find((h) => isOrbitPauseTarget(h.object));
      if (!hit) return;

      syncOrbit(false);
      pausedRef.current = true;
    }

    function onPointerUp() {
      if (!pausedRef.current) return;
      syncOrbit(true);
      pausedRef.current = false;
    }

    canvas.addEventListener("pointerdown", onPointerDownCapture, true);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      if (pausedRef.current) syncOrbit(true);
      pausedRef.current = false;
      canvas.removeEventListener("pointerdown", onPointerDownCapture, true);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [camera, controlsRef, enabled, gl.domElement, raycaster, scene.children, skipInteraction]);

  return null;
}
