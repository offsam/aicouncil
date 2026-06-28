"use client";

import { useLayoutEffect, useRef } from "react";
import type { DirectionalLight } from "three";

export function SceneLighting() {
  const dirRef = useRef<DirectionalLight>(null);

  useLayoutEffect(() => {
    const light = dirRef.current;
    if (!light?.shadow) return;

    light.shadow.mapSize.set(2048, 2048);
    light.shadow.radius = 4;
    light.shadow.bias = -0.00015;
    light.shadow.normalBias = 0.02;

    const cam = light.shadow.camera;
    cam.near = 0.5;
    cam.far = 45;
    cam.left = -160;
    cam.right = 160;
    cam.top = 160;
    cam.bottom = -160;
    cam.updateProjectionMatrix();
  }, []);

  return (
    <>
      <hemisphereLight
        color="#fffaf5"
        groundColor="#2a2622"
        intensity={0.72}
      />
      <ambientLight intensity={0.38} color="#f5f0e8" />
      <directionalLight
        ref={dirRef}
        castShadow
        position={[5, 13, 7]}
        intensity={1.05}
        color="#ffffff"
      />
      <pointLight position={[-5, 4, 3]} intensity={0.55} color="#ffe8cc" />
      <pointLight position={[5, 3, -2]} intensity={0.45} color="#cce8f5" />
    </>
  );
}
