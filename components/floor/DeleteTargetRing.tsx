"use client";

import { LP } from "@/lib/floor-scene-config";

export function DeleteTargetRing({ size }: { size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
      <ringGeometry args={[size * 0.42, size * 0.52, LP.ring]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.78} />
    </mesh>
  );
}
