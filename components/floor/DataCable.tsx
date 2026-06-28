"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CatmullRomCurve3,
  MeshStandardMaterial,
  TubeGeometry,
  Vector3,
} from "three";
import type { Mesh } from "three";

interface DataCableProps {
  from: [number, number, number];
  to: [number, number, number];
  active?: boolean;
  activeColor?: string;
  /** office — провисающий кабель между главным офисом и помещением */
  variant?: "desk" | "office" | "workflow";
}

function buildCurve(
  from: [number, number, number],
  to: [number, number, number],
  variant: "desk" | "office" | "workflow",
) {
  const start = new Vector3(from[0], from[1], from[2]);
  const end = new Vector3(to[0], to[1], to[2]);
  const dist = Math.hypot(end.x - start.x, end.z - start.z);

  if (variant === "office" || variant === "workflow") {
    const drop = Math.max(0.08, Math.min(2.5, dist * 0.06));
    const mid = new Vector3(
      (start.x + end.x) / 2,
      Math.min(start.y, end.y) - drop,
      (start.z + end.z) / 2,
    );
    const nearStart = new Vector3(
      start.x + (end.x - start.x) * 0.2,
      start.y * 0.6,
      start.z + (end.z - start.z) * 0.2,
    );
    const nearEnd = new Vector3(
      start.x + (end.x - start.x) * 0.8,
      end.y + 0.08,
      start.z + (end.z - start.z) * 0.8,
    );
    return new CatmullRomCurve3([start, nearStart, mid, nearEnd, end]);
  }

  const lift = 0.12 + dist * 0.04;
  const mid = new Vector3(
    (start.x + end.x) / 2,
    Math.max(start.y, end.y) + lift,
    (start.z + end.z) / 2,
  );
  return new CatmullRomCurve3([start, mid, end]);
}

export function DataCable({
  from,
  to,
  active,
  activeColor = "#7eb8c4",
  variant = "desk",
}: DataCableProps) {
  const meshRef = useRef<Mesh>(null);

  const geometry = useMemo(() => {
    const curve = buildCurve(from, to, variant);
    const radius = variant === "office" ? 0.035 : 0.022;
    const segments = variant === "office" ? 32 : 24;
    return new TubeGeometry(curve, segments, radius, 8, false);
  }, [from, to, variant]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh?.material || !(mesh.material instanceof MeshStandardMaterial)) return;
    if (active) {
      mesh.material.emissiveIntensity =
        0.45 + Math.sin(clock.elapsedTime * 10) * 0.35;
    } else {
      mesh.material.emissiveIntensity = variant === "office" ? 0.12 : 0.08;
    }
  });

  const idleColor = variant === "office" ? "#71717a" : "#52525b";

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={active ? activeColor : idleColor}
        emissive={active ? activeColor : "#27272a"}
        emissiveIntensity={active ? 0.5 : variant === "office" ? 0.12 : 0.08}
        roughness={0.88}
        metalness={0.04}
      />
    </mesh>
  );
}

export function getDeskCableAnchor(obj: { position_x: number; position_z: number }) {
  return [obj.position_x, 0.1, obj.position_z] as [number, number, number];
}
