"use client";

import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Group } from "three";
import { LP } from "@/lib/floor-scene-config";
import { markOrbitPauseTarget } from "@/lib/floor-orbit-guard";
import { markBulldozerObject } from "./BulldozerEraseHandler";
import { isMarqueeModifier } from "@/lib/selection-modifiers";
import { AGENT_MODEL_TRANSFORM, AGENT_UI } from "@/lib/agent-model";
import { AgentWorkModel } from "./AgentWorkModel";

export interface AgentDeskProps {
  name: string;
  color: string;
  online: boolean;
  position: [number, number, number];
  isEditorSelected?: boolean;
  invalid?: boolean;
  preview?: boolean;
  working?: boolean;
  onSelect: (additive: boolean) => void;
  onDragStart?: () => void;
  onOrbitPause?: (enabled: boolean) => void;
  moveMode?: boolean;
  moveDragEnabled?: boolean;
  onMoveArm?: () => void;
  deleteMode?: boolean;
  deleteHover?: boolean;
  onDeleteHover?: () => void;
  onDeleteHoverEnd?: () => void;
  onContextMenu?: (e: { nativeEvent: MouseEvent; stopPropagation: () => void }) => void;
  textOutline?: string;
  blockPlacement?: boolean;
  objectId?: string;
}

function AgentHeadLamp({
  color,
  online,
  invalid,
}: {
  color: string;
  online: boolean;
  invalid?: boolean;
}) {
  const lampColor = invalid ? "#ef4444" : color;
  const glow = invalid ? 1.4 : online ? 1.6 : 0.35;

  return (
    <group position={[0, AGENT_UI.lampY, 0]}>
      <mesh>
        <sphereGeometry args={[AGENT_UI.lampRadius, LP.sphere[1], LP.sphere[2]]} />
        <meshStandardMaterial
          color={lampColor}
          emissive={lampColor}
          emissiveIntensity={glow}
          roughness={0.4}
          metalness={0}
        />
      </mesh>
      <mesh position={[0, -AGENT_UI.lampRadius * 0.6, 0]}>
        <cylinderGeometry args={[0.012, 0.018, 0.03, LP.ring]} />
        <meshStandardMaterial color="#71717a" roughness={0.85} metalness={0.05} />
      </mesh>
      {online && !invalid && (
        <pointLight color={lampColor} intensity={0.35} distance={1.4} decay={2} />
      )}
    </group>
  );
}

export function AgentDesk({
  name,
  color,
  online,
  position,
  isEditorSelected,
  invalid,
  preview,
  working = false,
  onSelect,
  onDragStart,
  onOrbitPause,
  onContextMenu,
  deleteMode = false,
  moveMode = false,
  moveDragEnabled = false,
  onMoveArm,
  deleteHover = false,
  onDeleteHover,
  onDeleteHoverEnd,
  textOutline = "#09090b",
  blockPlacement = false,
  objectId,
}: AgentDeskProps) {
  const groupRef = useRef<Group>(null);
  const hitRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const dragStarted = useRef(false);
  const floorY = AGENT_MODEL_TRANSFORM.floorY;

  useEffect(() => {
    if (preview || !hitRef.current) return;
    markOrbitPauseTarget(hitRef.current);
    if (objectId) markBulldozerObject(hitRef.current, objectId);
  }, [preview, objectId]);

  useFrame((_, delta) => {
    if (!groupRef.current || preview) return;
    if (hovered || isEditorSelected) {
      groupRef.current.position.y =
        floorY + Math.sin(Date.now() * 0.003) * AGENT_UI.hoverBounce;
    } else {
      groupRef.current.position.y += (floorY - groupRef.current.position.y) * delta * 4;
    }
  });

  const deleteLit = deleteMode && (hovered || deleteHover);
  const showRing = isEditorSelected || hovered || invalid || deleteLit;
  const ringColor = invalid || deleteLit
    ? "#ef4444"
    : isEditorSelected
      ? color
      : "#5c9699";

  return (
    <group ref={groupRef} position={[position[0], floorY, position[2]]}>
      <group
        ref={hitRef}
        raycast={preview || blockPlacement ? () => null : undefined}
        onPointerDown={(e) => {
          if (preview || blockPlacement) return;
          if (e.button !== 0) return;
          if (isMarqueeModifier(e.nativeEvent)) return;
          e.stopPropagation();
          onOrbitPause?.(false);
          if (deleteMode) {
            onSelect(e.nativeEvent.shiftKey);
            return;
          }
          if (moveMode) {
            onSelect(e.nativeEvent.shiftKey);
            if (!moveDragEnabled || !onDragStart) {
              const onUp = () => {
                if (!dragStarted.current) onMoveArm?.();
                onOrbitPause?.(true);
                window.removeEventListener("pointerup", onUp);
              };
              window.addEventListener("pointerup", onUp);
              return;
            }
          }
          if (!onDragStart) return;
          dragStarted.current = false;
          const startX = e.clientX;
          const startY = e.clientY;
          const dragSlop = moveMode ? 4 : 4;
          const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (Math.hypot(dx, dy) > dragSlop) {
              dragStarted.current = true;
              onDragStart?.();
              window.removeEventListener("pointermove", onMove);
            }
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            if (moveMode && !dragStarted.current) onMoveArm?.();
            onOrbitPause?.(true);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
        onClick={(e) => {
          if (preview || blockPlacement || deleteMode || moveMode || isMarqueeModifier(e.nativeEvent)) return;
          e.stopPropagation();
          onSelect(e.nativeEvent.shiftKey);
        }}
        onPointerUp={(e) => {
          if (e.button !== 0 || isMarqueeModifier(e.nativeEvent)) return;
          if (deleteMode || !onDragStart) onOrbitPause?.(true);
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          onContextMenu?.(e);
        }}
        onPointerOver={(e) => {
          if (preview) return;
          e.stopPropagation();
          setHovered(true);
          if (deleteMode) onDeleteHover?.();
          document.body.style.cursor = deleteMode ? "crosshair" : "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          if (deleteMode) onDeleteHoverEnd?.();
          document.body.style.cursor = "auto";
        }}
      >
        <AgentWorkModel working={working && !preview} />
      </group>

      <AgentHeadLamp color={color} online={online} invalid={invalid || deleteLit} />

      <Text
        position={[0, AGENT_UI.labelY, 0]}
        fontSize={0.16}
        color={invalid ? "#fca5a5" : color}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.012}
        outlineColor={textOutline}
      >
        {name}
      </Text>

      {showRing && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
          <ringGeometry args={[AGENT_UI.ring.inner, AGENT_UI.ring.outer, LP.ring]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.65} />
        </mesh>
      )}
    </group>
  );
}
