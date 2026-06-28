"use client";

import { useMemo } from "react";
import { FLOOR_GRID } from "@/lib/floor-grid";
import { parseCellKey } from "@/lib/floor-cell-key";
import { matteSoft } from "@/lib/floor-scene-config";
import { Path, Shape, ShapeGeometry } from "three";

interface CutoutFloorMeshProps {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  color: string;
  y?: number;
  erased?: Set<string> | string[];
  emissive?: string;
  emissiveIntensity?: number;
  renderOrder?: number;
  transparent?: boolean;
  opacity?: number;
  /** Родитель уже стоит в центре — не добавлять centerX/centerZ к position. */
  localSpace?: boolean;
}

function buildCutoutGeometry(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  centerX: number,
  centerZ: number,
  erased: Set<string>,
) {
  const localMinX = minX - centerX;
  const localMaxX = maxX - centerX;
  const localMinZ = minZ - centerZ;
  const localMaxZ = maxZ - centerZ;

  const shape = new Shape();
  shape.moveTo(localMinX, localMinZ);
  shape.lineTo(localMaxX, localMinZ);
  shape.lineTo(localMaxX, localMaxZ);
  shape.lineTo(localMinX, localMaxZ);
  shape.closePath();

  const half = FLOOR_GRID / 2;
  for (const key of erased) {
    const parsed = parseCellKey(key);
    if (!parsed) continue;
    if (parsed.x < minX || parsed.x >= maxX || parsed.z < minZ || parsed.z >= maxZ) continue;

    const lx = parsed.x - centerX;
    const lz = parsed.z - centerZ;
    const hole = new Path();
    hole.moveTo(lx - half, lz - half);
    hole.lineTo(lx + half, lz - half);
    hole.lineTo(lx + half, lz + half);
    hole.lineTo(lx - half, lz + half);
    hole.closePath();
    shape.holes.push(hole);
  }

  return new ShapeGeometry(shape);
}

export function CutoutFloorMesh({
  minX,
  maxX,
  minZ,
  maxZ,
  color,
  y = 0.032,
  erased,
  emissive = "#000000",
  emissiveIntensity = 0,
  renderOrder = 2,
  transparent,
  opacity = 1,
  localSpace = false,
}: CutoutFloorMeshProps) {
  const erasedSet = useMemo(
    () => (erased instanceof Set ? erased : new Set(erased ?? [])),
    [erased],
  );

  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const meshX = localSpace ? 0 : centerX;
  const meshZ = localSpace ? 0 : centerZ;
  const useCutouts = erasedSet.size > 0;

  const cutoutGeometry = useMemo(() => {
    if (!useCutouts) return null;
    return buildCutoutGeometry(minX, maxX, minZ, maxZ, centerX, centerZ, erasedSet);
  }, [minX, maxX, minZ, maxZ, centerX, centerZ, erasedSet, useCutouts]);

  const matProps = {
    color,
    emissive,
    emissiveIntensity,
    transparent,
    opacity,
    depthWrite: !transparent,
    ...matteSoft,
  };

  if (!useCutouts) {
    return (
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[meshX, y, meshZ]}
        receiveShadow
        renderOrder={renderOrder}
        raycast={() => null}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
    );
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[meshX, y, meshZ]}
      receiveShadow
      renderOrder={renderOrder}
      raycast={() => null}
      geometry={cutoutGeometry ?? undefined}
    >
      <meshStandardMaterial {...matProps} />
    </mesh>
  );
}
