"use client";

import { useEffect, useState } from "react";
import type { BuildingNodeData } from "@/lib/workspace/build-workspace-graph";
import { DEFAULT_TECH_DEPARTMENT_VISIBLE_COUNTERS } from "@/lib/workspace/tech-department-counters";
import { TechDepartmentStatTiles } from "./TechDepartmentStatTiles";

type TechDepartmentTileCountersProps = {
  snapshot?: BuildingNodeData["techDeptSnapshot"];
  visibleCounterIds?: string[];
  pulseAt?: number;
};

/** Event-driven NOC tile — counts refresh when canvas mutates, no polling. */
export function TechDepartmentTileCounters({
  snapshot,
  visibleCounterIds = DEFAULT_TECH_DEPARTMENT_VISIBLE_COUNTERS,
  pulseAt,
}: TechDepartmentTileCountersProps) {
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (!pulseAt) return;
    setPulsing(true);
    const timer = window.setTimeout(() => setPulsing(false), 650);
    return () => window.clearTimeout(timer);
  }, [pulseAt]);

  if (!snapshot) {
    return (
      <div className="workspace-tech-dept-quiet nodrag nopan" data-testid="workspace-tech-dept-tile">
        <span className="workspace-tech-dept-quiet-label">NOC</span>
        <span className="workspace-tech-dept-quiet-hint">загрузка…</span>
      </div>
    );
  }

  return (
    <div
      className={`workspace-tech-dept-tile-counters nodrag nopan${pulsing ? " workspace-tech-dept-tile-counters--pulse" : ""}`}
      data-testid="workspace-tech-dept-tile"
      title={`Счётчики по canvas · ${new Date(snapshot.updatedAt).toLocaleTimeString()}`}
    >
      <TechDepartmentStatTiles
        stats={snapshot}
        visibleCounterIds={visibleCounterIds}
        structuralOnly
        testId="workspace-tech-dept-tile-stats"
      />
    </div>
  );
}
