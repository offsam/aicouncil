"use client";

import { useCallback } from "react";
import { useStore, type ReactFlowState } from "@xyflow/react";

export type HeaderMetrics = {
  chamberCount: number;
  agentCount: number;
};

export function useBuildingHeaderMetrics(buildingId: string): HeaderMetrics {
  const chamberCount = useStore(
    useCallback((state: ReactFlowState) => {
      let count = 0;
      for (const n of state.nodes) {
        if (n.parentId === buildingId && n.type === "chamber") count += 1;
      }
      return count;
    }, [buildingId]),
  );

  const agentCount = useStore(
    useCallback((state: ReactFlowState) => {
      let count = 0;
      const chamberIds = new Set<string>();
      for (const n of state.nodes) {
        if (n.parentId === buildingId && n.type === "chamber") chamberIds.add(n.id);
      }
      for (const n of state.nodes) {
        if (n.type === "agent" && n.parentId && chamberIds.has(n.parentId)) count += 1;
      }
      return count;
    }, [buildingId]),
  );

  return { chamberCount, agentCount };
}

export function useChamberHeaderMetrics(chamberRegistryId: string): HeaderMetrics {
  const agentCount = useStore(
    useCallback((state: ReactFlowState) => {
      let count = 0;
      for (const n of state.nodes) {
        if (n.type === "agent" && n.parentId === chamberRegistryId) count += 1;
      }
      return count;
    }, [chamberRegistryId]),
  );

  return { chamberCount: 0, agentCount };
}
