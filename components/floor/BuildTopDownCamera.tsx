"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { FLOOR_CAMERA } from "@/lib/floor-scene-config";
import { WORK_FLOOR } from "@/lib/office-bounds";

interface BuildTopDownCameraProps {
  active: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

const TOP_DOWN_HEIGHT = FLOOR_CAMERA.topDownHeight;

export function BuildTopDownCamera({ active, controlsRef }: BuildTopDownCameraProps) {
  const { camera } = useThree();

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (active) {
      const targetZ = WORK_FLOOR.centerZ;
      controls.target.set(0, 0, targetZ);
      camera.position.set(0, TOP_DOWN_HEIGHT, targetZ + 0.01);
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = 0.05;
      controls.update();
    } else {
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI / 2.2;
    }
  }, [active, camera, controlsRef]);

  return null;
}
