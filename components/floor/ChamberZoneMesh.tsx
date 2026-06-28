"use client";

import { Billboard, Text } from "@react-three/drei";
import { EdgesGeometry, PlaneGeometry } from "three";

interface ChamberZoneMeshProps {
  x: number;
  z: number;
  width: number;
  depth: number;
  name: string;
  labelColor?: string;
  textOutline?: string;
}

/** Static chamber zone overlay inside a building footprint. */
export function ChamberZoneMesh({
  x,
  z,
  width,
  depth,
  name,
  labelColor = "#a78bfa",
  textOutline = "#09090b",
}: ChamberZoneMeshProps) {
  const titleSize = Math.min(0.28, Math.min(width, depth) * 0.12);
  const planeGeo = new PlaneGeometry(width, depth);

  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#8b5cf6" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <edgesGeometry args={[planeGeo]} />
        <lineBasicMaterial color="#a78bfa" transparent opacity={0.85} />
      </lineSegments>
      <Billboard position={[0, 0.35, 0]}>
        <Text
          fontSize={titleSize}
          color={labelColor}
          outlineWidth={0.02}
          outlineColor={textOutline}
          anchorX="center"
          anchorY="middle"
          maxWidth={width * 0.9}
        >
          {name}
        </Text>
      </Billboard>
    </group>
  );
}
