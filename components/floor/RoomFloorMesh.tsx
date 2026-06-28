"use client";

import { useEffect, useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { hexFromPastelOrRaw } from "@/lib/floor-pastel-palette";
import { markOrbitPauseTarget } from "@/lib/floor-orbit-guard";
import { roomCellBounds } from "@/lib/floor-cell-key";
import type { Mesh } from "three";
import { CutoutFloorMesh } from "./CutoutFloorMesh";

interface RoomFloorMeshProps {
  width: number;
  depth: number;
  worldCenterX?: number;
  worldCenterZ?: number;
  color?: string | null;
  label?: string | null;
  labelColor?: string;
  textOutline?: string;
  isDark?: boolean;
  selected?: boolean;
  preview?: boolean;
  invalid?: boolean;
  interactive?: boolean;
  onClick?: (e: { stopPropagation: () => void; shiftKey: boolean; ctrlKey: boolean }) => void;
  deleteMode?: boolean;
  erasedCells?: Set<string> | string[];
}

export function RoomFloorMesh({
  width,
  depth,
  worldCenterX = 0,
  worldCenterZ = 0,
  color,
  label,
  labelColor = "#5c9699",
  textOutline = "#09090b",
  isDark = true,
  selected,
  preview,
  invalid,
  interactive = true,
  onClick,
  deleteMode = false,
  erasedCells,
}: RoomFloorMeshProps) {
  const floorRef = useRef<Mesh>(null);

  useEffect(() => {
    if (floorRef.current) markOrbitPauseTarget(floorRef.current);
  }, []);

  const fill = invalid
    ? "#ef4444"
    : hexFromPastelOrRaw(color ?? "cream", isDark);
  const edgeColor = invalid ? "#ef4444" : isDark ? "#7ec8d4" : "#5c9699";
  const titleSize = Math.min(0.42, Math.min(width, depth) * 0.07);

  const bounds = roomCellBounds({
    position_x: worldCenterX,
    position_z: worldCenterZ,
    size_w: width,
    size_d: depth,
  });

  return (
    <group>
      <CutoutFloorMesh
        minX={bounds.minX}
        maxX={bounds.maxX}
        minZ={bounds.minZ}
        maxZ={bounds.maxZ}
        color={fill}
        emissive={invalid ? "#ef4444" : preview ? "#000000" : "#000000"}
        emissiveIntensity={invalid ? 0.25 : preview ? 0.05 : 0}
        y={0.032}
        erased={erasedCells}
        renderOrder={preview ? 3 : 2}
        transparent={preview}
        opacity={preview ? 0.78 : 1}
        localSpace
      />

      {interactive && !deleteMode && (
        <mesh
          ref={floorRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.04, 0]}
          onClick={(e) => {
            if (onClick)
              onClick({
                stopPropagation: () => e.stopPropagation(),
                shiftKey: e.nativeEvent.shiftKey,
                ctrlKey: e.nativeEvent.ctrlKey,
              });
            else e.stopPropagation();
          }}
        >
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}

      {[
        { pos: [0, 0.015, -depth / 2] as const, size: [width, 0.02, 0.04] as const },
        { pos: [0, 0.015, depth / 2] as const, size: [width, 0.02, 0.04] as const },
        { pos: [-width / 2, 0.015, 0] as const, size: [0.04, 0.02, depth] as const },
        { pos: [width / 2, 0.015, 0] as const, size: [0.04, 0.02, depth] as const },
      ].map((seg, i) => (
        <mesh key={`room-edge-${i}`} position={seg.pos}>
          <boxGeometry args={seg.size} />
          <meshStandardMaterial
            color={selected ? "#5eead4" : edgeColor}
            transparent={preview}
            opacity={preview ? 0.65 : 0.9}
            roughness={0.9}
            metalness={0}
          />
        </mesh>
      ))}

      {label && (
        <Billboard position={[0, 0.55, 0]}>
          <Text
            fontSize={titleSize}
            color={labelColor}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor={textOutline}
            maxWidth={Math.max(width * 0.9, 2)}
          >
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}
