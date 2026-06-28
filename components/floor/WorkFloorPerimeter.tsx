"use client";

import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { WORK_FLOOR } from "@/lib/office-bounds";

interface WorkFloorPerimeterProps {
  isDark?: boolean;
  emphasized?: boolean;
}

type EdgeSpec = {
  pos: [number, number, number];
  size: [number, number, number];
  glowScale: [number, number, number];
};

function buildOutline(thick: number, barH: number, hw: number, hd: number, cz: number) {
  const innerW = WORK_FLOOR.width - thick * 2;
  const innerD = WORK_FLOOR.depth - thick * 2;

  const parts: EdgeSpec[] = [
    {
      pos: [0, 0, -hd + cz + thick / 2],
      size: [innerW, barH, thick],
      glowScale: [1, 1.35, 1.18],
    },
    {
      pos: [0, 0, hd + cz - thick / 2],
      size: [innerW, barH, thick],
      glowScale: [1, 1.35, 1.18],
    },
    {
      pos: [-hw + thick / 2, 0, cz],
      size: [thick, barH, innerD],
      glowScale: [1.18, 1.35, 1],
    },
    {
      pos: [hw - thick / 2, 0, cz],
      size: [thick, barH, innerD],
      glowScale: [1.18, 1.35, 1],
    },
    {
      pos: [-hw + thick / 2, 0, -hd + cz + thick / 2],
      size: [thick, barH, thick],
      glowScale: [1.1, 1.35, 1.1],
    },
    {
      pos: [hw - thick / 2, 0, -hd + cz + thick / 2],
      size: [thick, barH, thick],
      glowScale: [1.1, 1.35, 1.1],
    },
    {
      pos: [hw - thick / 2, 0, hd + cz - thick / 2],
      size: [thick, barH, thick],
      glowScale: [1.1, 1.35, 1.1],
    },
    {
      pos: [-hw + thick / 2, 0, hd + cz - thick / 2],
      size: [thick, barH, thick],
      glowScale: [1.1, 1.35, 1.1],
    },
  ];

  return parts;
}

/** Неоновый контур строго по границе рабочей площадки. */
export const WorkFloorPerimeter = memo(function WorkFloorPerimeter({
  isDark = true,
  emphasized = false,
}: WorkFloorPerimeterProps) {
  const groupRef = useRef<Group>(null);

  const hw = WORK_FLOOR.width / 2;
  const hd = WORK_FLOOR.depth / 2;
  const cz = WORK_FLOOR.centerZ;
  const lift = 0.04;

  const thick = emphasized ? 0.1 : 0.08;
  const barH = emphasized ? 0.048 : 0.04;

  const neon = emphasized
    ? isDark
      ? "#5bffef"
      : "#00e8c8"
    : isDark
      ? "#00ffe0"
      : "#00deb8";

  const glow = isDark ? "#b8fff8" : "#d4fff8";
  const highlight = isDark ? "#ffffff" : "#f5fffe";

  const parts = useMemo(
    () => buildOutline(thick, barH, hw, hd, cz),
    [barH, cz, hd, hw, thick],
  );

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    const pulse = 0.9 + Math.sin(clock.elapsedTime * 2.6) * 0.1;
    g.scale.set(1, pulse, 1);
  });

  return (
    <group ref={groupRef} position={[0, lift, 0]} raycast={() => null}>
      {parts.map((part, i) => {
        const isEdge = i < 4;
        return (
          <group key={`part-${i}`} position={part.pos}>
            <mesh renderOrder={3}>
              <boxGeometry
                args={[
                  part.size[0] * part.glowScale[0],
                  part.size[1] * part.glowScale[1],
                  part.size[2] * part.glowScale[2],
                ]}
              />
              <meshBasicMaterial
                color={glow}
                transparent
                opacity={emphasized ? 0.34 : 0.26}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>

            <mesh renderOrder={4}>
              <boxGeometry args={part.size} />
              <meshBasicMaterial color={neon} toneMapped={false} depthWrite={false} />
            </mesh>

            {isEdge && (
              <mesh position={[0, 0.003, 0]} renderOrder={5}>
                <boxGeometry
                  args={[
                    Math.max(part.size[0] - thick * 0.5, thick * 0.3),
                    barH * 0.42,
                    Math.max(part.size[2] - thick * 0.5, thick * 0.3),
                  ]}
                />
                <meshBasicMaterial
                  color={highlight}
                  transparent
                  opacity={0.82}
                  toneMapped={false}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
});
