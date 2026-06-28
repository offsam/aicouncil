"use client";

import { Grid } from "@react-three/drei";
import { FLOOR_GRID } from "@/lib/floor-grid";
import { WORK_FLOOR } from "@/lib/office-bounds";

interface BuildGridProps {
  active: boolean;
  isDark?: boolean;
}

export function BuildGrid({ active, isDark = true }: BuildGridProps) {
  if (!active) return null;

  const cell = isDark ? "#3d5a5e" : "#b8d4d8";
  const section = isDark ? "#5eead4" : "#0f766e";

  return (
    <Grid
      args={[WORK_FLOOR.width, WORK_FLOOR.depth]}
      position={[0, 0.012, WORK_FLOOR.centerZ]}
      renderOrder={5}
      cellSize={FLOOR_GRID}
      cellThickness={0.45}
      cellColor={cell}
      sectionSize={5}
      sectionThickness={0.8}
      sectionColor={section}
      fadeDistance={140}
      fadeStrength={1.2}
      infiniteGrid={false}
    />
  );
}
