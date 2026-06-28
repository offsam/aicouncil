"use client";

import { RoundedBox } from "@react-three/drei";
import { LP, matte } from "@/lib/floor-scene-config";
import { snapFloorCoord } from "@/lib/floor-grid";

interface WallDrawPreviewProps {
  x: number;
  z: number;
  rotationY: number;
  length: number;
  invalid?: boolean;
  drawing?: boolean;
  startX?: number;
  startZ?: number;
}

export function WallDrawPreview({
  x,
  z,
  rotationY,
  length,
  invalid,
  drawing = false,
  startX,
  startZ,
}: WallDrawPreviewProps) {
  const color = invalid ? "#ef4444" : "#86efac";
  const emissive = invalid ? "#ef4444" : "#22c55e";

  return (
    <group>
      {drawing && startX != null && startZ != null && (
        <mesh position={[snapFloorCoord(startX), 0.34, snapFloorCoord(startZ)]}>
          <sphereGeometry args={[0.14, LP.sphere[1], LP.sphere[2]]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={0.45}
            transparent
            opacity={0.95}
            {...matte}
          />
        </mesh>
      )}

      <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
        <RoundedBox
          args={[length, 0.6, 0.12]}
          radius={LP.rounded.radius}
          smoothness={LP.rounded.smoothness}
          position={[0, 0.3, 0]}
        >
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={invalid ? 0.45 : 0.22}
            transparent
            opacity={drawing ? 0.72 : 0.55}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
            {...matte}
          />
        </RoundedBox>
      </group>
    </group>
  );
}
