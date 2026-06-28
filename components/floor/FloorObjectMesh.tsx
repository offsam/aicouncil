"use client";

import { RoundedBox } from "@react-three/drei";
import type { OfficeObjectType } from "@/lib/office-types";
import { hexFromPastelOrRaw } from "@/lib/floor-pastel-palette";
import { LP, matte, matteSoft, objectPalette } from "@/lib/floor-scene-config";
import { DeleteTargetRing } from "./DeleteTargetRing";

function ObjectSelectionRing({ size, color }: { size: number; color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <ringGeometry args={[size * 0.45, size * 0.52, LP.ring]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} />
    </mesh>
  );
}

interface FloorObjectMeshProps {
  type: OfficeObjectType;
  color?: string | null;
  length?: number | null;
  invalid?: boolean;
  selected?: boolean;
  deleteHover?: boolean;
  selectionColor?: string;
  preview?: boolean;
  isDark?: boolean;
}

function resolveObjectColor(
  custom: string | null | undefined,
  fallback: string,
  isDark: boolean,
): string {
  if (!custom) return fallback;
  return hexFromPastelOrRaw(custom, isDark);
}

export function FloorObjectMesh({
  type,
  color,
  length,
  invalid,
  selected,
  deleteHover,
  selectionColor = "#5c9699",
  preview,
  isDark = true,
}: FloorObjectMeshProps) {
  const invalidMat = invalid
    ? { color: "#ef4444", emissive: "#ef4444", emissiveIntensity: 0.5 }
    : deleteHover
      ? { color: "#fca5a5", emissive: "#ef4444", emissiveIntensity: 0.35 }
      : null;
  const previewBoost = preview ? 0.08 : 0;

  if (type === "wall") {
    const wallLen = length ?? 2;
    const wallColor = resolveObjectColor(color, objectPalette.wall, isDark);
    return (
      <>
        <RoundedBox
          args={[wallLen, 0.6, 0.12]}
          radius={LP.rounded.radius}
          smoothness={LP.rounded.smoothness}
          position={[0, 0.3, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={invalidMat?.color ?? wallColor}
            emissive={invalidMat?.emissive ?? "#000000"}
            emissiveIntensity={(invalidMat?.emissiveIntensity ?? 0) + previewBoost}
            {...matte}
          />
        </RoundedBox>
        {selected && !deleteHover && <ObjectSelectionRing size={wallLen} color={selectionColor} />}
        {deleteHover && <DeleteTargetRing size={wallLen} />}
      </>
    );
  }

  if (type === "door") {
    const doorColor = resolveObjectColor(color, objectPalette.door, isDark);
    return (
      <>
        <RoundedBox
          args={[1, 0.6, 0.12]}
          radius={LP.rounded.radius}
          smoothness={LP.rounded.smoothness}
          position={[0, 0.3, 0]}
          castShadow
        >
          <meshStandardMaterial
            color={invalidMat?.color ?? doorColor}
            emissive={invalidMat?.emissive ?? "#000000"}
            emissiveIntensity={(invalidMat?.emissiveIntensity ?? 0) + previewBoost}
            {...matte}
          />
        </RoundedBox>
        {selected && !deleteHover && <ObjectSelectionRing size={1} color={selectionColor} />}
        {deleteHover && <DeleteTargetRing size={1} />}
      </>
    );
  }

  if (type === "cabinet") {
    return (
      <group>
        <RoundedBox
          args={[0.8, 0.7, 0.6]}
          radius={LP.rounded.radius}
          smoothness={LP.rounded.smoothness}
          position={[0, 0.35, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={invalidMat?.color ?? objectPalette.cabinet}
            emissive={invalidMat?.emissive ?? "#000000"}
            emissiveIntensity={(invalidMat?.emissiveIntensity ?? 0) + previewBoost}
            {...matte}
          />
        </RoundedBox>
        {[0.15, -0.05].map((y) => (
          <RoundedBox
            key={y}
            args={[0.7, 0.04, 0.02]}
            radius={0.01}
            smoothness={2}
            position={[0, 0.35 + y, 0.31]}
          >
            <meshStandardMaterial color={objectPalette.cabinetTrim} {...matteSoft} />
          </RoundedBox>
        ))}
        {selected && !deleteHover && <ObjectSelectionRing size={0.8} color={selectionColor} />}
        {deleteHover && <DeleteTargetRing size={0.8} />}
      </group>
    );
  }

  if (type === "board") {
    return (
      <group>
        <RoundedBox
          args={[1.6, 0.9, 0.06]}
          radius={LP.rounded.radius}
          smoothness={LP.rounded.smoothness}
          position={[0, 0.55, 0]}
          castShadow
        >
          <meshStandardMaterial
            color={invalidMat?.color ?? objectPalette.board}
            emissive={invalidMat?.emissive ?? "#000000"}
            emissiveIntensity={(invalidMat?.emissiveIntensity ?? 0) + previewBoost}
            {...matte}
          />
        </RoundedBox>
        <mesh position={[0, 0.55, 0.04]}>
          <boxGeometry args={[1.68, 0.98, 0.01]} />
          <meshBasicMaterial color={selectionColor} transparent opacity={0.25} />
        </mesh>
        {selected && !deleteHover && <ObjectSelectionRing size={1.6} color={selectionColor} />}
        {deleteHover && <DeleteTargetRing size={1.6} />}
      </group>
    );
  }

  return null;
}
