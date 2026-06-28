"use client";

import { OFFICE_ROOM, WORK_FLOOR } from "@/lib/office-bounds";
import type { SceneColors } from "@/lib/use-prefers-dark";
import { CutoutFloorMesh } from "./CutoutFloorMesh";

export type FloorZone = "inner" | "outer";

interface OfficeRoomProps {
  colors: SceneColors;
  showInnerFloor?: boolean;
  showOuterFloor?: boolean;
  deleteMode?: boolean;
  erodedInner?: Set<string> | string[];
  erodedOuter?: Set<string> | string[];
}

export function OfficeRoom({
  colors,
  showInnerFloor = true,
  showOuterFloor = true,
  deleteMode = false,
  erodedInner,
  erodedOuter,
}: OfficeRoomProps) {
  const roomW = OFFICE_ROOM.width;
  const roomD = OFFICE_ROOM.depth;
  const roomZ = OFFICE_ROOM.centerZ;

  const innerMinX = -roomW / 2;
  const innerMaxX = roomW / 2;
  const innerMinZ = roomZ - roomD / 2;
  const innerMaxZ = roomZ + roomD / 2;

  const outerW = WORK_FLOOR.width;
  const outerD = WORK_FLOOR.depth;
  const outerZ = WORK_FLOOR.centerZ;
  const outerMinX = -outerW / 2;
  const outerMaxX = outerW / 2;
  const outerMinZ = outerZ - outerD / 2;
  const outerMaxZ = outerZ + outerD / 2;

  const innerColor = deleteMode ? "#fecaca" : colors.floorInner;
  const outerColor = deleteMode ? "#fecaca" : colors.floorOuter;

  return (
    <group>
      {showInnerFloor && (
        <>
          <CutoutFloorMesh
            minX={innerMinX}
            maxX={innerMaxX}
            minZ={innerMinZ}
            maxZ={innerMaxZ}
            color={innerColor}
            emissive={deleteMode ? "#ef4444" : "#000000"}
            emissiveIntensity={deleteMode ? 0.05 : 0}
            y={-0.008}
            erased={erodedInner}
          />

          {!deleteMode &&
            [
              { pos: [0, 0.02, -roomD / 2 + roomZ] as const, size: [roomW, 0.02, 0.04] as const },
              { pos: [0, 0.02, roomD / 2 + roomZ] as const, size: [roomW, 0.02, 0.04] as const },
              { pos: [-roomW / 2, 0.02, roomZ] as const, size: [0.04, 0.02, roomD] as const },
              { pos: [roomW / 2, 0.02, roomZ] as const, size: [0.04, 0.02, roomD] as const },
            ].map((edge, i) => (
              <mesh key={`edge-${i}`} position={edge.pos}>
                <boxGeometry args={edge.size} />
                <meshStandardMaterial color={colors.outline} roughness={0.9} metalness={0} />
              </mesh>
            ))}
        </>
      )}

      {showOuterFloor && (
        <CutoutFloorMesh
          minX={outerMinX}
          maxX={outerMaxX}
          minZ={outerMinZ}
          maxZ={outerMaxZ}
          color={outerColor}
          emissive={deleteMode ? "#ef4444" : "#000000"}
          emissiveIntensity={deleteMode ? 0.05 : 0}
          y={-0.05}
          erased={erodedOuter}
        />
      )}
    </group>
  );
}
