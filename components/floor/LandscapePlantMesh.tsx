"use client";

import { LP } from "@/lib/floor-scene-config";
import type { LandscapePlantType } from "@/lib/landscape-plants";
import { PLANT_DEFAULT_SCALE } from "@/lib/landscape-plants";
import { DeleteTargetRing } from "./DeleteTargetRing";

function flatMat(color: string) {
  return {
    color,
    roughness: 0.94,
    metalness: 0,
    flatShading: true as const,
  };
}

function SelectionRing({ size }: { size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <ringGeometry args={[size * 0.55, size * 0.65, LP.ring]} />
      <meshBasicMaterial color="#5c9699" transparent opacity={0.55} />
    </mesh>
  );
}

function SpruceTreeModel({ isDark, invalid }: { isDark: boolean; invalid?: boolean }) {
  const trunk = invalid ? "#7f1d1d" : isDark ? "#3a3228" : "#5c4a3a";
  const leaf = invalid ? "#ef4444" : isDark ? "#1a3328" : "#3d6b4a";

  return (
    <>
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 0.18, 5]} />
        <meshStandardMaterial {...flatMat(trunk)} />
      </mesh>
      <mesh position={[0, 0.28, 0]} castShadow>
        <coneGeometry args={[0.16, 0.22, 6]} />
        <meshStandardMaterial {...flatMat(leaf)} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <coneGeometry args={[0.12, 0.18, 6]} />
        <meshStandardMaterial {...flatMat(leaf)} />
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow>
        <coneGeometry args={[0.08, 0.14, 5]} />
        <meshStandardMaterial {...flatMat(leaf)} />
      </mesh>
    </>
  );
}

function BushModel({ isDark, invalid }: { isDark: boolean; invalid?: boolean }) {
  const leaf = invalid ? "#ef4444" : isDark ? "#234a32" : "#4a8f58";
  const dark = invalid ? "#991b1b" : isDark ? "#1a3324" : "#3d7a4a";

  return (
    <>
      <mesh position={[0, 0.14, 0]} castShadow>
        <sphereGeometry args={[0.22, 7, 6]} />
        <meshStandardMaterial {...flatMat(leaf)} />
      </mesh>
      <mesh position={[-0.1, 0.1, 0.06]} castShadow>
        <sphereGeometry args={[0.14, 6, 5]} />
        <meshStandardMaterial {...flatMat(dark)} />
      </mesh>
      <mesh position={[0.11, 0.08, -0.05]} castShadow>
        <sphereGeometry args={[0.12, 6, 5]} />
        <meshStandardMaterial {...flatMat(dark)} />
      </mesh>
    </>
  );
}

function FlowerModel({ isDark, invalid }: { isDark: boolean; invalid?: boolean }) {
  const stem = invalid ? "#7f1d1d" : isDark ? "#3a4a28" : "#5c7a3a";
  const petal = invalid ? "#ef4444" : isDark ? "#c084fc" : "#e879f9";
  const center = invalid ? "#fca5a5" : isDark ? "#fde047" : "#facc15";

  return (
    <>
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.016, 0.16, 5]} />
        <meshStandardMaterial {...flatMat(stem)} />
      </mesh>
      {[
        [0.08, 0.14, 0],
        [-0.07, 0.15, 0.04],
        [0.02, 0.16, -0.08],
        [0.05, 0.13, 0.07],
      ].map(([x, y, z], i) => (
        <mesh key={`petal-${i}`} position={[x, y, z]} castShadow>
          <sphereGeometry args={[0.045, 5, 4]} />
          <meshStandardMaterial {...flatMat(petal)} />
        </mesh>
      ))}
      <mesh position={[0, 0.17, 0]} castShadow>
        <sphereGeometry args={[0.035, 5, 4]} />
        <meshStandardMaterial {...flatMat(center)} />
      </mesh>
    </>
  );
}

interface LandscapePlantMeshProps {
  type: LandscapePlantType;
  isDark?: boolean;
  invalid?: boolean;
  selected?: boolean;
  deleteHover?: boolean;
  preview?: boolean;
  scale?: number | null;
}

export function LandscapePlantMesh({
  type,
  isDark = true,
  invalid,
  selected,
  deleteHover,
  preview,
  scale,
}: LandscapePlantMeshProps) {
  const plantScale = scale ?? PLANT_DEFAULT_SCALE[type];
  const ringSize = type === "tree" ? 0.35 : type === "bush" ? 0.45 : 0.3;

  return (
    <group scale={plantScale * (preview ? 0.95 : 1)}>
      {type === "tree" && <SpruceTreeModel isDark={isDark} invalid={invalid || deleteHover} />}
      {type === "bush" && <BushModel isDark={isDark} invalid={invalid || deleteHover} />}
      {type === "flower" && <FlowerModel isDark={isDark} invalid={invalid || deleteHover} />}
      {selected && !deleteHover && <SelectionRing size={ringSize} />}
      {deleteHover && <DeleteTargetRing size={ringSize} />}
    </group>
  );
}
