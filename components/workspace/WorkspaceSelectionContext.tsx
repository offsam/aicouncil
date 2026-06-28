"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AgentAssignmentRow, ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import type { InspectorTarget } from "@/lib/workspace/inspector-target";
import { inspectorTargetKey } from "@/lib/workspace/inspector-target";
import type { WorkspaceConnectionRow } from "@/lib/workspace/workspace-connections";
import type { LastParticipationExecution } from "@/lib/workspace/last-participation-execution";
import type { BuildingAccentId } from "@/lib/workspace/building-accent";

export type WorkspaceCanvasSnapshot = {
  officeId: string;
  cityName: string;
  chambers: ChamberRow[];
  buildings: OfficeObjectRow[];
  connections: WorkspaceConnectionRow[];
};

export type WorkspaceCanvasActions = {
  removeConnection: (connectionId: string) => void;
  updateConnection: (connection: WorkspaceConnectionRow) => void;
  updateChamberLabel: (registryId: string, name: string) => void;
  updateChamberRoutingDescription: (
    registryId: string,
    routingDescription: string | null,
  ) => void;
  updateBuildingLabel: (buildingId: string, label: string) => void;
  removeAssignmentNode: (assignmentId: string) => void;
  appendAssignmentNode: (assignment: AgentAssignmentRow) => void;
  reloadCanvas: () => Promise<void>;
  selectTarget: (target: InspectorTarget | null) => void;
  clearSelection: () => void;
  deleteSelectedDeletable: (targets?: InspectorTarget[]) => Promise<void>;
  selectAllOnCanvas: () => void;
  openBuildingInspector: (buildingId: string) => void;
  pickConnectEntity: (registryId: string) => void;
  renameBuilding: (buildingId: string, label: string) => Promise<void>;
  renameChamber: (chamberId: string, buildingId: string, name: string) => Promise<void>;
  setBuildingColor: (buildingId: string, paletteId: BuildingAccentId) => Promise<void>;
  setChamberColor: (
    buildingId: string,
    chamberId: string,
    registryId: string,
    paletteId: BuildingAccentId,
  ) => Promise<void>;
  setAgentColor: (agentId: string, iconId: string) => Promise<void>;
  setConnectionColor: (connectionId: string, paletteId: BuildingAccentId) => Promise<void>;
  requestDeleteBuilding: (buildingId: string) => void;
  deleteChamber: (chamberId: string, buildingId: string, entityRegistryId: string) => void;
  syncChamberRoutingRole: (
    chamberId: string,
    routingRole: "main" | null,
    clearedMainChamberIds?: string[],
  ) => void;
  syncChamberManager: (chamberId: string, managerAgentId: string | null) => void;
};

type WorkspaceSelectionContextValue = {
  selectedTargets: InspectorTarget[];
  primaryTarget: InspectorTarget | null;
  /** Backward-compatible alias for primaryTarget (W8). */
  selectedTarget: InspectorTarget | null;
  selectedKey: string | null;
  inspectorOpen: boolean;
  inspectorCollapsed: boolean;
  setSelection: (targets: InspectorTarget[], primary?: InspectorTarget | null) => void;
  setSelectedTarget: (target: InspectorTarget | null) => void;
  openInspector: (target: InspectorTarget) => void;
  closeInspector: () => void;
  collapseInspectorPanel: () => void;
  expandInspectorPanel: () => void;
  clearSelection: () => void;
  snapshot: WorkspaceCanvasSnapshot | null;
  registerSnapshot: (snapshot: WorkspaceCanvasSnapshot) => void;
  registerActions: (actions: WorkspaceCanvasActions) => void;
  getActions: () => WorkspaceCanvasActions | null;
  nameByRegistryId: (registryId: string) => string;
  lastParticipationExecution: LastParticipationExecution | null;
  recordLastParticipationExecution: (execution: LastParticipationExecution) => void;
};

const INSPECTOR_COLLAPSED_STORAGE_KEY = "workspace-inspector-collapsed";

function readInspectorCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(INSPECTOR_COLLAPSED_STORAGE_KEY) === "1";
}

const WorkspaceSelectionContext = createContext<WorkspaceSelectionContextValue | null>(null);

export function WorkspaceSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedTargets, setSelectedTargetsState] = useState<InspectorTarget[]>([]);
  const [primaryTarget, setPrimaryTargetState] = useState<InspectorTarget | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [snapshot, setSnapshot] = useState<WorkspaceCanvasSnapshot | null>(null);
  const [lastParticipationExecution, setLastParticipationExecution] =
    useState<LastParticipationExecution | null>(null);
  const actionsRef = useRef<WorkspaceCanvasActions | null>(null);

  const setSelection = useCallback(
    (targets: InspectorTarget[], primary?: InspectorTarget | null) => {
      setSelectedTargetsState(targets);
      if (primary !== undefined) {
        setPrimaryTargetState(primary);
        return;
      }
      if (targets.length === 0) {
        setPrimaryTargetState(null);
      } else if (targets.length === 1) {
        setPrimaryTargetState(targets[0]);
      } else {
        setPrimaryTargetState((prev) => {
          if (
            prev &&
            targets.some((t) => inspectorTargetKey(t) === inspectorTargetKey(prev))
          ) {
            return prev;
          }
          return targets[0];
        });
      }
    },
    [],
  );

  const setSelectedTarget = useCallback((target: InspectorTarget | null) => {
    if (!target) {
      setSelectedTargetsState([]);
      setPrimaryTargetState(null);
      setInspectorOpen(false);
      return;
    }
    setSelectedTargetsState([target]);
    setPrimaryTargetState(target);
    setInspectorOpen(true);
  }, []);

  useEffect(() => {
    setInspectorCollapsed(readInspectorCollapsedPreference());
  }, []);

  const persistInspectorCollapsed = useCallback((collapsed: boolean) => {
    setInspectorCollapsed(collapsed);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSPECTOR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
    }
  }, []);

  const collapseInspectorPanel = useCallback(() => {
    persistInspectorCollapsed(true);
  }, [persistInspectorCollapsed]);

  const expandInspectorPanel = useCallback(() => {
    persistInspectorCollapsed(false);
  }, [persistInspectorCollapsed]);

  const openInspector = useCallback((target: InspectorTarget) => {
    setSelectedTargetsState([target]);
    setPrimaryTargetState(target);
    setInspectorOpen(true);
    persistInspectorCollapsed(false);
  }, [persistInspectorCollapsed]);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setSelectedTargetsState([]);
    setPrimaryTargetState(null);
    actionsRef.current?.clearSelection();
  }, []);

  const clearSelection = useCallback(() => {
    setInspectorOpen(false);
    setSelectedTargetsState([]);
    setPrimaryTargetState(null);
    actionsRef.current?.clearSelection();
  }, []);

  const recordLastParticipationExecution = useCallback(
    (execution: LastParticipationExecution) => {
      setLastParticipationExecution(execution);
    },
    [],
  );

  useEffect(() => {
    type DevWindow = {
      __workspaceSelectTarget?: (target: InspectorTarget | null) => void;
      __workspaceSetSelection?: (targets: InspectorTarget[]) => void;
      __workspaceSelectAll?: () => void;
      __workspaceSelectBuilding?: (buildingId: string) => void;
      __workspacePickConnect?: (registryId: string) => void;
      __workspaceDeleteSelected?: () => Promise<void>;
      __workspaceDeleteTargets?: (targets: InspectorTarget[]) => Promise<void>;
      __workspaceRecordParticipation?: (execution: LastParticipationExecution) => void;
    };
    const w = window as DevWindow;
    w.__workspaceRecordParticipation = recordLastParticipationExecution;

    if (process.env.NODE_ENV !== "production") {
      w.__workspaceSelectTarget = (target) => {
        if (target) openInspector(target);
        else closeInspector();
      };
      w.__workspaceSetSelection = (targets) => setSelection(targets, targets[0] ?? null);
      w.__workspaceSelectAll = () => actionsRef.current?.selectAllOnCanvas();
      w.__workspaceSelectBuilding = (buildingId: string) =>
        actionsRef.current?.openBuildingInspector(buildingId);
      w.__workspacePickConnect = (registryId: string) =>
        actionsRef.current?.pickConnectEntity(registryId);
      w.__workspaceDeleteSelected = () =>
        actionsRef.current?.deleteSelectedDeletable() ?? Promise.resolve();
      w.__workspaceDeleteTargets = (targets: InspectorTarget[]) =>
        actionsRef.current?.deleteSelectedDeletable(targets) ?? Promise.resolve();
    }
    return () => {
      delete w.__workspaceRecordParticipation;
      if (process.env.NODE_ENV !== "production") {
        delete w.__workspaceSelectTarget;
        delete w.__workspaceSetSelection;
        delete w.__workspaceSelectAll;
        delete w.__workspaceSelectBuilding;
        delete w.__workspacePickConnect;
        delete w.__workspaceDeleteSelected;
        delete w.__workspaceDeleteTargets;
      }
    };
  }, [openInspector, closeInspector, setSelection, recordLastParticipationExecution]);

  const registerSnapshot = useCallback((next: WorkspaceCanvasSnapshot) => {
    setSnapshot(next);
  }, []);

  const registerActions = useCallback((actions: WorkspaceCanvasActions) => {
    actionsRef.current = actions;
  }, []);

  const getActions = useCallback(() => actionsRef.current, []);

  const nameByRegistryId = useCallback(
    (registryId: string) => {
      if (!snapshot) return registryId.slice(0, 8);
      const chamber = snapshot.chambers.find((c) => c.entity_registry_id === registryId);
      if (chamber) return chamber.name;
      if (registryId === snapshot.officeId) return snapshot.cityName;
      const building = snapshot.buildings.find((b) => b.id === registryId);
      if (building) return building.label ?? "Building";
      return registryId.slice(0, 8);
    },
    [snapshot],
  );

  const value = useMemo(
    (): WorkspaceSelectionContextValue => ({
      selectedTargets,
      primaryTarget,
      selectedTarget: primaryTarget,
      selectedKey: inspectorTargetKey(primaryTarget),
      inspectorOpen,
      inspectorCollapsed,
      setSelection,
      setSelectedTarget,
      openInspector,
      closeInspector,
      collapseInspectorPanel,
      expandInspectorPanel,
      clearSelection,
      snapshot,
      registerSnapshot,
      registerActions,
      getActions,
      nameByRegistryId,
      lastParticipationExecution,
      recordLastParticipationExecution,
    }),
    [
      selectedTargets,
      primaryTarget,
      inspectorOpen,
      inspectorCollapsed,
      setSelection,
      setSelectedTarget,
      openInspector,
      closeInspector,
      collapseInspectorPanel,
      expandInspectorPanel,
      clearSelection,
      snapshot,
      registerSnapshot,
      registerActions,
      getActions,
      nameByRegistryId,
      lastParticipationExecution,
      recordLastParticipationExecution,
    ],
  );

  return (
    <WorkspaceSelectionContext.Provider value={value}>{children}</WorkspaceSelectionContext.Provider>
  );
}

export function useWorkspaceSelection(): WorkspaceSelectionContextValue {
  const ctx = useContext(WorkspaceSelectionContext);
  if (!ctx) {
    throw new Error("useWorkspaceSelection must be used within WorkspaceSelectionProvider");
  }
  return ctx;
}
