"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Box3, Mesh } from "three";
import type { Group } from "three";
import {
  AGENT_MODEL_TRANSFORM,
  AGENT_WORK_MODEL_URL,
} from "@/lib/agent-model";

useGLTF.preload(AGENT_WORK_MODEL_URL);

export function AgentWorkModel({ working = false }: { working?: boolean }) {
  const rootRef = useRef<Group>(null);
  const { scene, animations } = useGLTF(AGENT_WORK_MODEL_URL);
  const { actions, names } = useAnimations(animations, rootRef);

  const { model, floorLift } = useMemo(() => {
    const cloned = clone(scene);
    cloned.updateMatrixWorld(true);
    const box = new Box3().setFromObject(cloned);
    const scale = AGENT_MODEL_TRANSFORM.scale;
    const lift = -box.min.y * scale;

    cloned.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    return { model: cloned, floorLift: lift };
  }, [scene]);

  useEffect(() => {
    if (names.length === 0) return;
    const action = actions[names[0]];
    if (!action) return;

    if (working) {
      action.reset().fadeIn(0.25).play();
    } else {
      action.fadeOut(0.15);
      action.stop();
      action.reset();
    }

    return () => {
      action.fadeOut(0.15);
      action.stop();
    };
  }, [actions, names, working]);

  return (
    <group
      ref={rootRef}
      scale={AGENT_MODEL_TRANSFORM.scale}
      rotation={[0, AGENT_MODEL_TRANSFORM.rotationY, 0]}
      position={[0, floorLift, 0]}
    >
      <primitive object={model} />
    </group>
  );
}
