"use client";

import { memo } from "react";
import { Sky } from "@react-three/drei";
import { WORK_FLOOR } from "@/lib/office-bounds";

const GRASS_SIZE = 380;

/** Единственный слой травы — ниже рабочей площадки, без дублей */
const GRASS_Y = -0.16;

function flatMat(color: string, opts?: { offset?: boolean }) {
  return {
    color,
    roughness: 0.94,
    metalness: 0,
    flatShading: true as const,
    ...(opts?.offset
      ? { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }
      : {}),
  };
}

const FAR_HILLS: Array<[number, number, number]> = [
  [-200, -175, 0.18],
  [185, -168, 0.15],
  [-160, 190, 0.14],
  [210, 178, 0.16],
  [0, -210, 0.2],
];

const FAR_BUILDINGS: Array<[number, number, number, number]> = [
  [-240, -195, 3, 5],
  [-225, -200, 2.5, 4],
  [230, -192, 3.5, 6],
  [50, -230, 4, 7],
  [-60, -225, 2.8, 5],
];

interface SiteLandscapeProps {
  isDark: boolean;
}

export const SiteLandscape = memo(function SiteLandscape({ isDark }: SiteLandscapeProps) {
  const cz = WORK_FLOOR.centerZ;

  const grass = isDark ? "#182018" : "#72a678";
  const hill = isDark ? "#1e2820" : "#6d8f72";
  const skyline = isDark ? "#1a2024" : "#8a949c";
  const fogColor = isDark ? "#141210" : "#c5d8cc";

  return (
    <group raycast={() => null}>
      <fog attach="fog" args={[fogColor, isDark ? 120 : 140, isDark ? 520 : 560]} />
      <Sky
        distance={450000}
        sunPosition={isDark ? [80, 14, 60] : [120, 26, 80]}
        inclination={0.5}
        azimuth={0.2}
        mieCoefficient={isDark ? 0.003 : 0.005}
        mieDirectionalG={0.8}
        turbidity={isDark ? 7 : 3.5}
        rayleigh={isDark ? 0.75 : 1.1}
      />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, GRASS_Y, cz]}
        receiveShadow
        renderOrder={0}
      >
        <planeGeometry args={[GRASS_SIZE, GRASS_SIZE, 1, 1]} />
        <meshStandardMaterial {...flatMat(grass, { offset: true })} />
      </mesh>

      {FAR_HILLS.map(([x, z, s], i) => (
        <mesh key={`hill-${i}`} position={[x, s * 2 - 0.14, z + cz]} scale={[s * 18, s * 5, s * 14]}>
          <sphereGeometry args={[1, 6, 5]} />
          <meshStandardMaterial {...flatMat(hill)} />
        </mesh>
      ))}

      {FAR_BUILDINGS.map(([x, z, w, h], i) => (
        <mesh key={`sky-${i}`} position={[x, h / 2 - 0.08, z + cz]}>
          <boxGeometry args={[w, h, w * 0.7]} />
          <meshStandardMaterial {...flatMat(skyline)} />
        </mesh>
      ))}
    </group>
  );
});
