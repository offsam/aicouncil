"use client";

import { createContext, useContext } from "react";
import type {
  WorkspaceAddMenuActionId,
  WorkspaceAddMenuTarget,
} from "@/lib/workspace/workspace-add-menu";

export type PersistChamberGeometryArgs = {
  chamberId: string;
  buildingId: string;
  entityRegistryId?: string;
  flowX: number;
  flowY: number;
  widthPx: number;
  heightPx: number;
};

export type PersistBuildingGeometryArgs = {
  buildingId: string;
  flowX: number;
  flowY: number;
  widthPx: number;
  heightPx: number;
};

export type PersistAgentGeometryArgs = {
  assignmentId: string;
  chamberDbId: string;
  flowX: number;
  flowY: number;
  sizePx: number;
};

export type WorkspaceActions = {
  renameBuilding: (buildingId: string, label: string) => Promise<void>;
  requestDeleteBuilding: (buildingId: string) => void;
  createChamber: (
    buildingId: string,
    name?: string,
    routingDescription?: string,
  ) => Promise<void>;
  renameChamber: (chamberId: string, buildingId: string, name: string) => Promise<void>;
  deleteChamber: (
    chamberId: string,
    buildingId: string,
    entityRegistryId: string,
  ) => void;
  persistChamberGeometry: (args: PersistChamberGeometryArgs) => Promise<void>;
  persistBuildingGeometry: (args: PersistBuildingGeometryArgs) => Promise<void>;
  persistAgentGeometry: (args: PersistAgentGeometryArgs) => Promise<void>;
  repositionConnectionHandle: (
    nodeId: string,
    handleId: string,
    perimeterPercent: number,
    persist: boolean,
  ) => void;
  pickConnectEntity: (registryId: string) => void;
  startConnectFrom: (registryId: string) => void;
  openAddMenu: (target: WorkspaceAddMenuTarget, initialStep?: WorkspaceAddMenuActionId) => void;
  openAgentInspector: (assignmentId: string) => void;
  deleteAgentAssignment: (assignmentId: string, chamberDbId: string) => void;
  addConnectionPort: (nodeId: string, type?: "source" | "target") => void;
  setTechDepartmentVisibleCounters: (counterIds: string[]) => Promise<void>;
  recordUndoSnapshot: () => void;
  finishResizeUndoRecord: () => void;
};

const WorkspaceActionsContext = createContext<WorkspaceActions | null>(null);

export function WorkspaceActionsProvider({
  value,
  children,
}: {
  value: WorkspaceActions;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceActionsContext.Provider value={value}>
      {children}
    </WorkspaceActionsContext.Provider>
  );
}

export function useWorkspaceActions(): WorkspaceActions {
  const ctx = useContext(WorkspaceActionsContext);
  if (!ctx) {
    throw new Error("useWorkspaceActions must be used within WorkspaceActionsProvider");
  }
  return ctx;
}
