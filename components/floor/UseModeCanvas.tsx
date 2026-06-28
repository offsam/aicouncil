"use client";

import { useRef, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MOUSE } from "three";
import type {
  OfficeObjectRow,
  ChamberRow,
  AgentAssignmentRow,
} from "@/lib/office-types";
import type { SceneColors } from "@/lib/use-prefers-dark";
import { SceneLighting } from "./SceneLighting";
import { ChamberZoneMesh } from "./ChamberZoneMesh";
import { AgentDesk } from "./AgentDesk";
import { getAgentVisual } from "@/lib/agent-visual";
import { hexFromPastelOrRaw } from "@/lib/floor-pastel-palette";
import { getChamberLocalPosition } from "@/lib/floor-chamber-position";

interface UseModeCanvasProps {
  building: OfficeObjectRow;
  chambers: ChamberRow[];
  assignments: Record<string, AgentAssignmentRow[]>;
  sceneColors: SceneColors;
  isDark: boolean;
  activeAgentIds: string[];
}

function getAgentOffsets(count: number, width: number, depth: number): Array<{ x: number; z: number }> {
  if (count <= 1) {
    return [{ x: 0, z: 0 }];
  }
  if (count === 2) {
    return [
      { x: -width * 0.22, z: 0 },
      { x: width * 0.22, z: 0 },
    ];
  }
  if (count === 3) {
    return [
      { x: -width * 0.22, z: -depth * 0.2 },
      { x: width * 0.22, z: -depth * 0.2 },
      { x: 0, z: depth * 0.2 },
    ];
  }
  return [
    { x: -width * 0.22, z: -depth * 0.22 },
    { x: width * 0.22, z: -depth * 0.22 },
    { x: -width * 0.22, z: depth * 0.22 },
    { x: width * 0.22, z: depth * 0.22 },
  ].slice(0, count);
}

export function UseModeCanvas({
  building,
  chambers,
  assignments,
  sceneColors,
  isDark,
  activeAgentIds,
}: UseModeCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  
  const width = building.size_w ?? 14;
  const depth = building.size_d ?? 9;

  const floorColor = useMemo(() => {
    return hexFromPastelOrRaw(building.color ?? "cream", isDark);
  }, [building.color, isDark]);

  return (
    <Canvas
      shadows
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      className="h-full w-full"
    >
      <PerspectiveCamera
        makeDefault
        position={[0, Math.max(width, depth) * 1.0, Math.max(width, depth) * 0.85]}
        fov={45}
      />
      <OrbitControls
        ref={controlsRef}
        enabled
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        panSpeed={0.6}
        zoomSpeed={0.9}
        minDistance={3}
        maxDistance={Math.max(width, depth) * 3}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, 0]}
        mouseButtons={{
          LEFT: MOUSE.ROTATE,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.PAN,
        }}
      />

      <SceneLighting />

      {/* Building Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={floorColor} roughness={0.8} />
      </mesh>

      {/* Building Perimeter Outline */}
      {[
        { pos: [0, 0.015, -depth / 2] as const, size: [width, 0.02, 0.04] as const },
        { pos: [0, 0.015, depth / 2] as const, size: [width, 0.02, 0.04] as const },
        { pos: [-width / 2, 0.015, 0] as const, size: [0.04, 0.02, depth] as const },
        { pos: [width / 2, 0.015, 0] as const, size: [0.04, 0.02, depth] as const }
      ].map((seg, i) => {
        return (
          <mesh key={`b-edge-${i}`} position={[seg.pos[0], 0.015, seg.pos[2]]}>
            <boxGeometry args={seg.size} />
            <meshStandardMaterial
              color={sceneColors.outline}
              roughness={0.9}
              metalness={0}
            />
          </mesh>
        );
      })}

      {/* Chambers & Assigned Agents */}
      {chambers.map((chamb) => {
        const local = getChamberLocalPosition(chamb);
        const chamberW = Number(chamb.width);
        const chamberD = Number(chamb.depth);

        // Fetch assignments & filter down to agents list
        const chamberAssigns = assignments[chamb.id] || [];
        const uniqueAgents = Array.from(
          new Map(
            chamberAssigns
              .map((a) => a.agents || (a.agent_id ? { id: a.agent_id, name: `Agent ${a.agent_id.substring(0, 5)}` } : null))
              .filter(Boolean)
              .map((agent) => [agent!.id, agent!])
          ).values()
        );

        const offsets = getAgentOffsets(uniqueAgents.length, chamberW, chamberD);

        return (
          <group key={`chamber-group-${chamb.id}`}>
            {/* Draw chamber zone */}
            <ChamberZoneMesh
              x={local.x}
              z={local.z}
              width={chamberW}
              depth={chamberD}
              name={chamb.name}
              labelColor={sceneColors.label}
              textOutline={sceneColors.textOutline}
            />

            {/* Draw desks for assigned agents inside the chamber */}
            {uniqueAgents.map((agent, index) => {
              const offset = offsets[index] || { x: 0, z: 0 };
              const visual = getAgentVisual({
                id: agent.id,
                name: agent.name,
                office_id: null,
                provider: "unknown",
                model_id: "unknown",
                status: "online",
                created_at: new Date().toISOString(),
              });
              const isWorking = activeAgentIds.includes(agent.id);

              return (
                <group
                  key={`agent-desk-${agent.id}`}
                  position={[local.x + offset.x, 0.01, local.z + offset.z]}
                >
                  <AgentDesk
                    name={visual.name}
                    color={visual.color}
                    online={visual.status === "online"}
                    position={[0, 0, 0]}
                    onSelect={() => {}}
                    working={isWorking}
                    preview={false}
                    blockPlacement={true}
                  />
                </group>
              );
            })}
          </group>
        );
      })}
    </Canvas>
  );
}
