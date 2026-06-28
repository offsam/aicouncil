"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useUpdateNodeInternals,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type OnConnect,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
  type ReactFlowInstance,
  type XYPosition,
  useKeyPress,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ConnectionMode, SelectionMode } from "@xyflow/system";
import { DEFAULT_BUILDING, DEFAULT_CHAMBER } from "@/lib/control-defaults";
import { useWorkspaceExecutionMode } from "@/components/workspace/WorkspaceExecutionModeContext";
import { isCostTierActiveForExecutionMode } from "@/lib/workspace/execution-mode-tiers";
import { normalizeCostTier } from "@/lib/cost-tier";
import type { AgentAssignmentRow, ChamberRow, ConnectionRoutePath, OfficeObjectRow } from "@/lib/office-types";
import {
  buildAgentAssignmentNode,
  buildWorkspaceNodes,
  parseWorkspaceMeta,
} from "@/lib/workspace/build-workspace-graph";
import {
  countChambersByBuilding,
  getBuildingChamberCount,
} from "@/lib/workspace/chamber-counts";
import type { WorkspaceMeta } from "@/lib/workspace/constants";
import {
  MINIMAP_NODE_COLORS,
  WORKSPACE_CANVAS_BG_DEFAULT,
  WORKSPACE_NODE_DRAG_HANDLE,
  WORKSPACE_UNIT_PX,
} from "@/lib/workspace/constants";
import {
  buildingToFlowNode,
  chamberToFlowPosition,
  clampAgentFlowGeometry,
  clampChamberFlowGeometry,
  flowNodeToBuildingCenter,
  flowToAgentLocal,
  flowToChamberLocal,
  nodeSizePx,
  parentBuildingSizePx,
} from "@/lib/workspace/coords";
import {
  normalizeNodeDimensions,
  normalizeNodesDimensions,
  withNodeDimensions,
} from "@/lib/workspace/sync-node-dimensions";
import {
  agentNodeBuildingId,
  agentNodeRegistryId,
  bumpBuildingMetrics,
  bumpChamberAgentCount,
} from "@/lib/workspace/node-header-metrics";
import {
  CITY_HALL_BUILDING_LABEL,
  buildingsForWorkspaceCanvas,
  chamberRegistryId,
  chambersOnWorkspaceCanvas,
  cityHallObjectPayload,
  isCityHallBuilding,
  resolveCityHallBuildingId,
} from "@/lib/workspace/city-hall-building";
import { clampAgentSizePx } from "@/lib/workspace/agent-layout";
import { defaultChamberLocalPosition } from "@/lib/workspace/chamber-layout";
import {
  chamberDragSizePx,
  resolveChamberResizePosition,
  resolveChamberResizeSizePx,
} from "@/lib/workspace/chamber-geometry-persist";
import {
  buildConnectionEdges,
  collectWiredHandleIds,
  CONNECTION_EDGE_Z_INDEX,
  NEW_CONNECTION_PERMISSIONS,
  type ConnectionEdgeData,
  type WorkspaceConnectionRegistry,
  type WorkspaceConnectionRow,
} from "@/lib/workspace/workspace-connections";
import { normalizeVisibleTechCounters } from "@/lib/workspace/tech-department-counters";
import {
  patchTechDepartmentInventoryNode,
  techInventoryFingerprint,
} from "@/lib/workspace/tech-department-inventory";
import type { ConnectionHandleOverrides, ConnectionHandleSlot } from "@/lib/workspace/connection-handle-slots";
import {
  applyDragRouteTranslation,
  collectMovingNodeIds,
  nodesToRefreshOnDrag,
  type ConnectionDragFollowState,
} from "@/lib/workspace/connection-drag-follow";
import { nodeAbsolutePosition } from "@/lib/workspace/connection-handle-flow-coords";
import {
  createCustomHandleSlot,
  CUSTOM_PORT_PERCENTS,
  normalizeConnectionHandleAssignment,
  pruneConnectionHandleAssignments,
} from "@/lib/workspace/connection-handle-slots";
import type { AgentNodeData, BuildingNodeData, ChamberNodeData } from "@/lib/workspace/build-workspace-graph";
import {
  resolveInspectorTargetFromEdge,
  resolveInspectorTargetFromNode,
} from "@/lib/workspace/inspector-target";
import type { InspectorTarget } from "@/lib/workspace/inspector-target";
import {
  accentIndexFromPaletteId,
  buildingAccentCssVars,
  connectionEdgeStyle,
  resolveBuildingAccentIndex,
  type BuildingAccentId,
} from "@/lib/workspace/building-accent";
import type { WorkspaceAddMenuActionId, WorkspaceAddMenuTarget } from "@/lib/workspace/workspace-add-menu";
import {
  countDeletableTargets,
  isMarqueeSelectableNode,
  resolveTargetFromNode,
  resolveTargetsFromGraphSelection,
  type SelectionResolveContext,
} from "@/lib/workspace/selection";
import { workspaceAssignmentNodeId } from "@/lib/workspace/agent-nodes";
import { syncWorkspaceUndoSnapshot } from "@/lib/workspace/sync-workspace-undo";
import {
  cloneWorkspaceUndoSnapshot,
  MAX_WORKSPACE_UNDO,
  type WorkspaceUndoSnapshot,
} from "@/lib/workspace/workspace-undo";
import {
  activeConnectionBetween,
  findNodeByEntityRegistryId,
  isConnectableNode,
  nodeToEntityRegistryId,
} from "@/lib/workspace/connect-entities";
import { ConnectionDragFollowProvider } from "./ConnectionDragFollowContext";
import { ConnectionEdge } from "./ConnectionEdge";
import { DeleteBuildingModal } from "./DeleteBuildingModal";
import { WorkspaceAddMenu } from "./WorkspaceAddMenu";
import { BuildingCreateDialog } from "./BuildingCreateDialog";
import { ChamberCreateDialog } from "./ChamberCreateDialog";
import { WorkspaceActionsProvider } from "./WorkspaceActionsContext";
import { WorkspaceOverlayProvider, useWorkspaceOverlayLayer } from "./WorkspaceOverlayContext";
import { resolveRouteActiveVisual } from "@/lib/workspace/resolve-route-active-visual";
import { useWorkspaceRoute } from "./WorkspaceRouteContext";
import { useWorkspaceSelection, type WorkspaceCanvasActions } from "./WorkspaceSelectionContext";
import { WorkspaceToolbar } from "./WorkspaceToolbar";
import { useWorkspaceChat } from "./WorkspaceChatContext";
import { useWorkspaceLocale } from "./WorkspaceLocaleContext";
import { useWorkspaceAppearance } from "./WorkspaceAppearanceContext";
import { AgentNode } from "./nodes/AgentNode";
import { BuildingNode } from "./nodes/BuildingNode";
import { ChamberNode } from "./nodes/ChamberNode";
import { useClampedPointPanelStyle } from "./nodes/useZoomAnchoredMenuPosition";

const nodeTypes = {
  building: BuildingNode,
  chamber: ChamberNode,
  agent: AgentNode,
};

const edgeTypes = {
  connection: ConnectionEdge,
};

function viewportStorageKey(officeId: string): string {
  return `workspace-viewport-${officeId}`;
}

function edgeStyleForConnection(
  connectionId: string | undefined,
  connections: WorkspaceConnectionRow[],
) {
  if (!connectionId) return connectionEdgeStyle(null);
  const conn = connections.find((c) => c.id === connectionId);
  return connectionEdgeStyle(conn?.color);
}

type OfficePayload = {
  office?: { name?: string; workspace_meta?: unknown };
  agents?: Array<{ id: string }>;
  error?: string;
};

type PaneMenuState = {
  clientX: number;
  clientY: number;
  flow: XYPosition;
} | null;

type BuildingCreateState = {
  flow: XYPosition;
} | null;

type DeleteBlockedState = {
  buildingId: string;
  label: string;
  chamberCount: number;
} | null;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized;
  const n = Number.parseInt(full, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function normalizeCanvasBg(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return WORKSPACE_CANVAS_BG_DEFAULT;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  if (luminance <= 0.58) return color;
  const dark = hexToRgb(WORKSPACE_CANVAS_BG_DEFAULT) ?? { r: 7, g: 10, b: 18 };
  return rgbToHex({
    r: dark.r * 0.82 + rgb.r * 0.18,
    g: dark.g * 0.82 + rgb.g * 0.18,
    b: dark.b * 0.82 + rgb.b * 0.18,
  });
}

async function fetchJsonResponse<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch(input, init);
  const text = await res.text();
  if (!res.ok) {
    return {
      data: null,
      error: text || `HTTP ${res.status}`,
    };
  }
  if (!text) {
    return { data: null, error: null };
  }
  try {
    return { data: JSON.parse(text) as T, error: null };
  } catch {
    return {
      data: null,
      error: "Unexpected non-JSON response from the workspace API.",
    };
  }
}

function FlowCenterToolbar({
  wrapperRef,
  rfInstance,
  onCreateAt,
  creating,
  connectMode,
  onToggleConnect,
  connectHint,
  selectionCount,
  connectionCount,
  canvasBg,
  onCanvasBgChange,
  canUndo,
  undoCount,
  onUndo,
}: {
  wrapperRef: RefObject<HTMLDivElement | null>;
  rfInstance: RefObject<ReactFlowInstance | null>;
  onCreateAt: (flowCenter: XYPosition, name: string, routingDescription: string) => void;
  creating: boolean;
  connectMode: boolean;
  onToggleConnect: () => void;
  connectHint?: string | null;
  selectionCount: number;
  connectionCount: number;
  canvasBg: string;
  onCanvasBgChange: (color: string) => void;
  canUndo: boolean;
  undoCount: number;
  onUndo: () => void;
}) {
  const viewportCenter = useCallback(() => {
    const el = wrapperRef.current;
    const rf = rfInstance.current;
    if (!el || !rf) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return rf.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [wrapperRef, rfInstance]);

  return (
    <WorkspaceToolbar
      creating={creating}
      connectMode={connectMode}
      onToggleConnect={onToggleConnect}
      connectHint={connectHint}
      selectionCount={selectionCount}
      connectionCount={connectionCount}
      canvasBg={canvasBg}
      onCanvasBgChange={onCanvasBgChange}
      canUndo={canUndo}
      undoCount={undoCount}
      onUndo={onUndo}
      onCreateBuilding={(name, routingDescription) =>
        onCreateAt(viewportCenter(), name, routingDescription)
      }
    />
  );
}

export function WorkspaceCanvas({
  officeId,
  techDepartmentBuildingId,
}: {
  officeId: string;
  techDepartmentBuildingId: string;
}) {
  const { effectiveTheme } = useWorkspaceAppearance();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      const normalizedChanges = changes.map((change) => {
        if (
          change.type === "dimensions" &&
          change.dimensions &&
          change.resizing === false &&
          !change.setAttributes
        ) {
          return { ...change, setAttributes: true as const };
        }
        return change;
      });
      const hasDimensions = normalizedChanges.some((change) => change.type === "dimensions");
      if (!hasDimensions) {
        onNodesChange(normalizedChanges);
        return;
      }
      setNodes((nds) => normalizeNodesDimensions(applyNodeChanges(normalizedChanges, nds)));
    },
    [onNodesChange, setNodes],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [connectSaving, setConnectSaving] = useState(false);
  const [connections, setConnections] = useState<WorkspaceConnectionRow[]>([]);
  const [connectionLayoutTick, setConnectionLayoutTick] = useState(0);
  const [connectionDragFollow, setConnectionDragFollow] =
    useState<ConnectionDragFollowState>(null);
  const dragStartAbsoluteRef = useRef<XYPosition | null>(null);
  const [paneMenu, setPaneMenu] = useState<PaneMenuState>(null);
  const [buildingCreate, setBuildingCreate] = useState<BuildingCreateState>(null);
  const [chamberCreateBuildingId, setChamberCreateBuildingId] = useState<string | null>(null);
  const [creatingChamber, setCreatingChamber] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<DeleteBlockedState>(null);
  const [addMenuTarget, setAddMenuTarget] = useState<WorkspaceAddMenuTarget | null>(null);
  const [addMenuInitialStep, setAddMenuInitialStep] = useState<WorkspaceAddMenuActionId | null>(
    null,
  );
  const [connectFromMenu, setConnectFromMenu] = useState(false);
  const [canvasBg, setCanvasBg] = useState(WORKSPACE_CANVAS_BG_DEFAULT);
  const canvasBgRef = useRef(WORKSPACE_CANVAS_BG_DEFAULT);
  const [undoStack, setUndoStack] = useState<WorkspaceUndoSnapshot[]>([]);
  const applyingUndoRef = useRef(false);
  const recordingResizeUndoRef = useRef(false);
  const [overlayStackCount, setOverlayStackCount] = useState(0);
  const workspaceMetaRef = useRef<WorkspaceMeta>({});
  const handleOverridesRef = useRef<ConnectionHandleOverrides>({});
  const connectionHandleAssignmentsRef = useRef<
    Record<string, { sourceHandle: string; targetHandle: string }>
  >({});
  const extraHandlesRef = useRef<Record<string, ConnectionHandleSlot[]>>({});
  const handlePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const spacePanActive = useKeyPress("Space", { actInsideInputWithModifier: false });
  const spacePanActiveRef = useRef(false);
  useEffect(() => {
    spacePanActiveRef.current = spacePanActive;
  }, [spacePanActive]);
  const chamberCountsRef = useRef<Map<string, number>>(new Map());
  const poolAgentCountRef = useRef(0);
  const techInventorySigRef = useRef("");
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeLookupRef = useRef<{
    chambers: ChamberRow[];
    buildings: OfficeObjectRow[];
    assignments: AgentAssignmentRow[];
  }>({ chambers: [], buildings: [], assignments: [] });
  const connectionsRef = useRef<WorkspaceConnectionRow[]>([]);
  const cityNameRef = useRef("AI Council");
  const { activeRouteHighlight, registerRouteLookup, setRouteSourceEntityId, executionProgress } =
    useWorkspaceRoute();
  const { executionMode } = useWorkspaceExecutionMode();
  const { setSelection, setSelectedTarget, registerSnapshot, registerActions, nameByRegistryId, selectedTargets, openInspector, closeInspector, inspectorOpen } =
    useWorkspaceSelection();
  const { t } = useWorkspaceLocale();
  const connectModeRef = useRef(connectMode);
  const connectSourceIdRef = useRef<string | null>(connectSourceId);
  const connectSavingRef = useRef(false);
  const createConnectionInFlightRef = useRef(false);
  /** Ignore node-click connect right after a handle drag completed (same pointer release). */
  const blockClickConnectRef = useRef(false);
  const createConnectionRef = useRef<
    (
      sourceId: string,
      targetId: string,
      handles?: {
        sourceNodeId: string;
        targetNodeId: string;
        sourceHandle: string | null;
        targetHandle: string | null;
      },
    ) => Promise<void>
  >(async () => {});
  const selectionCtxRef = useRef<SelectionResolveContext | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const handleRoutePathChangeRef = useRef<
    (connectionId: string, routePath: ConnectionRoutePath | null) => void
  >(() => {});
  const deleteConnectionRef = useRef<(connectionId: string) => Promise<void>>(
    async () => {},
  );
  const openInspectorForEdgeRef = useRef<(edge: Edge) => void>(() => {});
  const selectEdgeForEditingRef = useRef<(edge: Edge) => void>(() => {});
  const canvasActionsRef = useRef<WorkspaceCanvasActions | null>(null);
  const pushWorkspaceUndoRef = useRef<() => void>(() => {});
  const pendingGeometrySavesRef = useRef<Map<string, Promise<void>>>(new Map());

  const waitForPendingGeometrySaves = useCallback(async () => {
    const pending = [...pendingGeometrySavesRef.current.values()];
    if (pending.length > 0) {
      await Promise.allSettled(pending);
    }
  }, []);

  const enqueueGeometrySave = useCallback((key: string, task: () => Promise<void>) => {
    const previous = pendingGeometrySavesRef.current.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(task)
      .finally(() => {
        if (pendingGeometrySavesRef.current.get(key) === next) {
          pendingGeometrySavesRef.current.delete(key);
        }
      });
    pendingGeometrySavesRef.current.set(key, next);
    return next;
  }, []);

  const handleRoutePathChange = useCallback(
    async (connectionId: string, routePath: ConnectionRoutePath | null) => {
      pushWorkspaceUndoRef.current();
      setConnections((prev) =>
        prev.map((c) => (c.id === connectionId ? { ...c, route_path: routePath } : c)),
      );
      setEdges((eds) =>
        eds.map((e) => {
          const d = e.data as ConnectionEdgeData;
          if (d.connectionId !== connectionId) return e;
          return {
            ...e,
            data: { ...d, routePath },
          };
        }),
      );
      try {
        const res = await fetch(`/api/connections/${connectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ route_path: routePath }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? "Failed to save cable route");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save cable route");
      }
    },
    [setEdges],
  );

  useEffect(() => {
    handleRoutePathChangeRef.current = handleRoutePathChange;
  }, [handleRoutePathChange]);

  useEffect(() => {
    connectModeRef.current = connectMode;
  }, [connectMode]);

  useEffect(() => {
    connectSourceIdRef.current = connectSourceId;
  }, [connectSourceId]);

  useEffect(() => {
    connectSavingRef.current = connectSaving;
  }, [connectSaving]);

  useEffect(() => {
    selectionCtxRef.current = {
      officeId,
      chambers: routeLookupRef.current.chambers,
      assignments: routeLookupRef.current.assignments,
      nameByRegistryId,
    };
  }, [officeId, nameByRegistryId, nodes]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    canvasBgRef.current = canvasBg;
  }, [canvasBg]);

  useEffect(() => {
    if (loading) return;
    setCanvasBg(effectiveTheme === "day" ? "#f5f0e8" : WORKSPACE_CANVAS_BG_DEFAULT);
  }, [effectiveTheme, loading]);

  const loadCanvas = useCallback(async () => {
    await waitForPendingGeometrySaves();
    setLoading(true);
    setError(null);
    try {
      const [officeResult, objectsResult, chambersResult, assignmentsResult, connectionsResult] =
        await Promise.all([
          fetchJsonResponse<OfficePayload>(`/api/offices/${officeId}`),
          fetchJsonResponse<{ objects?: OfficeObjectRow[]; error?: string }>(
            `/api/offices/${officeId}/objects`,
          ),
          fetchJsonResponse<{ chambers?: ChamberRow[]; error?: string }>("/api/chambers"),
          fetchJsonResponse<{
            assignmentsByChamber?: Record<string, AgentAssignmentRow[]>;
            error?: string;
          }>("/api/chambers/assignments"),
          fetchJsonResponse<{ connections?: WorkspaceConnectionRow[]; error?: string }>(
            "/api/connections",
          ),
        ]);

      const officeData = officeResult.data ?? {};
      const objectsData = objectsResult.data ?? {};
      const chambersData = chambersResult.data ?? {};
      const assignmentsData = assignmentsResult.data ?? {};
      const connectionsData = connectionsResult.data ?? {};

      const loadWarnings = [
        officeResult.error,
        objectsResult.error,
        chambersResult.error,
        assignmentsResult.error,
        connectionsResult.error,
      ].filter(Boolean);

      if (officeResult.data?.agents) {
        poolAgentCountRef.current = officeResult.data.agents.length;
      } else {
        poolAgentCountRef.current = 0;
      }

      const loadedConnections = connectionsData.connections ?? [];
      if (loadWarnings.length > 0) {
        setError(loadWarnings[0] ?? "Не удалось загрузить часть данных канваса");
      }

      const meta = parseWorkspaceMeta(officeData.office?.workspace_meta);
      workspaceMetaRef.current = meta;
      handleOverridesRef.current = meta.connection_handle_positions ?? {};
      const prunedAssignments = pruneConnectionHandleAssignments(
        meta.connection_handle_assignments ?? {},
        loadedConnections,
      );
      connectionHandleAssignmentsRef.current = prunedAssignments;
      const rawAssignments = meta.connection_handle_assignments ?? {};
      const assignmentsChanged =
        JSON.stringify(rawAssignments) !== JSON.stringify(prunedAssignments);
      if (assignmentsChanged) {
        workspaceMetaRef.current = {
          ...meta,
          connection_handle_assignments: prunedAssignments,
        };
        void fetch(`/api/offices/${officeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_meta: { connection_handle_assignments: prunedAssignments },
          }),
        }).catch(() => {
          /* non-fatal; jacks rebuild from edges on next load */
        });
      }
      extraHandlesRef.current = (meta.extra_connection_handles ?? {}) as Record<
        string,
        ConnectionHandleSlot[]
      >;
      setCanvasBg(normalizeCanvasBg(meta.canvas_bg ?? WORKSPACE_CANVAS_BG_DEFAULT));
      const cityName = officeData.office?.name ?? "AI Council";
      cityNameRef.current = cityName;

      const chambers = chambersData.chambers ?? [];
      chamberCountsRef.current = countChambersByBuilding(chambers);

      let buildings = (objectsData.objects ?? []).filter(
        (o) => o.object_type === "room",
      );

      if (!buildings.some(isCityHallBuilding)) {
        const created = await fetchJsonResponse<{ object?: OfficeObjectRow; error?: string }>(
          `/api/offices/${officeId}/objects`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              object_type: "room",
              label: CITY_HALL_BUILDING_LABEL,
              routing_description:
                "City Hall is the city's central routing hub and visual entry point for mayor-level coordination.",
              ...cityHallObjectPayload(meta),
            }),
          },
        );
        if (created.data?.object) {
          buildings = [...buildings, created.data.object];
        }
      }

      buildings = buildingsForWorkspaceCanvas(buildings, chambers);

      const duplicateCityHalls = (objectsData.objects ?? []).filter(
        (o) => o.object_type === "room" && isCityHallBuilding(o),
      ).length;
      if (duplicateCityHalls > 1) {
        setError(
          `В базе ${duplicateCityHalls} здания City Hall — на канвасе показано одно (с отделами). Лишние скрыты.`,
        );
      }

      const assignments = Object.values(assignmentsData.assignmentsByChamber ?? {}).flat();
      setConnections(loadedConnections);
      connectionsRef.current = loadedConnections;

      routeLookupRef.current = { chambers, buildings, assignments };
      registerRouteLookup(routeLookupRef.current);
      registerSnapshot({
        officeId,
        cityName,
        chambers,
        buildings,
        connections: loadedConnections,
      });
      setNodes(
        normalizeNodesDimensions(
          buildWorkspaceNodes(officeId, cityName, meta, buildings, chambers, assignments),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUndoStack([]);
      setLoading(false);
    }
  }, [officeId, registerRouteLookup, registerSnapshot, setNodes, waitForPendingGeometrySaves]);

  useEffect(() => {
    if (loading) return;
    const sig = techInventoryFingerprint(
      nodes,
      connections.length,
      poolAgentCountRef.current,
    );
    if (sig === techInventorySigRef.current) return;
    techInventorySigRef.current = sig;
    setNodes((nds) =>
      patchTechDepartmentInventoryNode(
        nds,
        connections.length,
        poolAgentCountRef.current,
        techDepartmentBuildingId,
      ),
    );
  }, [loading, nodes, connections.length, setNodes, techDepartmentBuildingId]);

  const removeConnectionFromCanvas = useCallback(
    (connectionId: string) => {
      setEdges((eds) =>
        eds.filter(
          (e) => (e.data as { connectionId?: string })?.connectionId !== connectionId,
        ),
      );
      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
      const nextAssignments = { ...connectionHandleAssignmentsRef.current };
      delete nextAssignments[connectionId];
      connectionHandleAssignmentsRef.current = nextAssignments;
      setConnectionLayoutTick((t) => t + 1);
    },
    [setEdges],
  );

  const deleteConnection = useCallback(
    async (connectionId: string) => {
      pushWorkspaceUndoRef.current();
      const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Connection delete failed");
      }
      removeConnectionFromCanvas(connectionId);
    },
    [removeConnectionFromCanvas],
  );

  useEffect(() => {
    deleteConnectionRef.current = deleteConnection;
  }, [deleteConnection]);

  useEffect(() => {
    connectionsRef.current = connections;
    if (loading) return;
    registerSnapshot({
      officeId,
      cityName: cityNameRef.current,
      chambers: routeLookupRef.current.chambers,
      buildings: routeLookupRef.current.buildings,
      connections,
    });
  }, [connections, loading, officeId, registerSnapshot]);

  const connectionRegistry = useCallback((): WorkspaceConnectionRegistry => {
    const visibleChambers = chambersOnWorkspaceCanvas(
      routeLookupRef.current.chambers,
      routeLookupRef.current.buildings,
    );
    const chamberRegistryIds = new Set(
      visibleChambers.map((chamber) => chamberRegistryId(chamber)).filter(Boolean),
    );
    const buildingRegistryIds = new Set(
      routeLookupRef.current.buildings.map((b) => b.id),
    );
    const agentRegistryIds = new Set<string>();
    const agentEntityToNodeId = new Map<string, string>();
    for (const assignment of routeLookupRef.current.assignments) {
      agentRegistryIds.add(assignment.agent_id);
      agentEntityToNodeId.set(
        assignment.agent_id,
        workspaceAssignmentNodeId(assignment.id),
      );
    }
    return {
      chamberRegistryIds,
      buildingRegistryIds,
      agentRegistryIds,
      agentEntityToNodeId,
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const registry = connectionRegistry();
    if (
      registry.chamberRegistryIds.size === 0 &&
      registry.buildingRegistryIds.size === 0 &&
      registry.agentRegistryIds.size === 0
    ) {
      return;
    }

    const currentNodes = nodesRef.current;
    connectionHandleAssignmentsRef.current = pruneConnectionHandleAssignments(
      connectionHandleAssignmentsRef.current,
      connections,
    );
    const { edges: builtEdges, nodeHandles } = buildConnectionEdges(
      connections,
      registry,
      currentNodes,
      handleOverridesRef.current,
      extraHandlesRef.current,
      connectionHandleAssignmentsRef.current,
    );

    const prevById = new Map(edgesRef.current.map((e) => [e.id, e]));

    const attachEdgeHandlers = (edge: Edge, prev: Edge | undefined): Edge => {
      const prevData = (prev?.data ?? {}) as ConnectionEdgeData;
      const builtData = edge.data as ConnectionEdgeData;
      return {
        ...edge,
        selected: prev?.selected ?? false,
        zIndex: prev?.zIndex ?? edge.zIndex ?? CONNECTION_EDGE_Z_INDEX,
        data: {
          ...builtData,
          routePath: prevData.routePath ?? builtData.routePath ?? null,
          highlighted: prevData.highlighted ?? false,
          dimmed: false,
          routeFading: prevData.routeFading ?? false,
          signalActive: prevData.signalActive ?? false,
          signalPulse: prevData.signalPulse ?? false,
          signalDirection: prevData.signalDirection,
          hovered: prevData.hovered ?? false,
          onRoutePathChange: (connectionId: string, routePath: ConnectionRoutePath | null) =>
            handleRoutePathChangeRef.current(connectionId, routePath),
          officeId,
          onDeleteConnection: (connectionId: string) =>
            deleteConnectionRef.current(connectionId),
          onOpenInspector: () => openInspectorForEdgeRef.current(edge),
          onSelectEdge: () => selectEdgeForEditingRef.current(edge),
        },
        style:
          prev?.style ??
          edge.style ??
          edgeStyleForConnection(builtData.connectionId, connectionsRef.current),
      };
    };

    const edgesWithHandlers: Edge[] = builtEdges.map((edge) =>
      attachEdgeHandlers(edge, prevById.get(edge.id)),
    );

    const wiredByNode = collectWiredHandleIds(edgesWithHandlers);

    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        const handles = nodeHandles.get(n.id);
        const wiredHandleIds = wiredByNode.get(n.id) ?? [];
        const prevData = n.data as {
          connectionHandles?: unknown;
          wiredHandleIds?: string[];
        };
        const handlesSame =
          JSON.stringify(handles ?? null) === JSON.stringify(prevData.connectionHandles ?? null);
        const wiredSame =
          wiredHandleIds.length === (prevData.wiredHandleIds?.length ?? 0) &&
          wiredHandleIds.every((id, i) => id === prevData.wiredHandleIds?.[i]);
        if (handlesSame && wiredSame) return n;
        changed = true;
        return {
          ...n,
          data: {
            ...(n.data as object),
            connectionHandles: handles,
            wiredHandleIds,
          },
        };
      });
      return changed ? next : nds;
    });

    const apply = () => {
      setEdges(edgesWithHandlers);
      requestAnimationFrame(() => {
        for (const nodeId of nodeHandles.keys()) {
          updateNodeInternals(nodeId);
        }
        requestAnimationFrame(() => {
          setNodes((nds) => normalizeNodesDimensions(nds));
        });
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(apply));
  }, [
    loading,
    connections,
    connectionLayoutTick,
    nodes.length,
    setEdges,
    setNodes,
    connectionRegistry,
    updateNodeInternals,
    officeId,
  ]);

  useEffect(() => {
    if (loading) return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setNodes((nds) => normalizeNodesDimensions(nds));
        requestAnimationFrame(() => {
          for (const node of nodesRef.current) {
            updateNodeInternals(node.id);
          }
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, setNodes, updateNodeInternals]);

  const cityHallId = useMemo(() => {
    const cityHallNode = nodes.find(
      (n) => n.type === "building" && (n.data as BuildingNodeData)?.isCityHall
    );
    return cityHallNode?.id || null;
  }, [nodes]);

  const buildingNodeIds = useMemo(
    () => new Set(nodes.filter((n) => n.type === "building").map((n) => n.id)),
    [nodes],
  );

  const agentIdToNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      if (node.type !== "agent") continue;
      const agentId = (node.data as AgentNodeData).agentId;
      if (agentId) map.set(agentId, node.id);
    }
    return map;
  }, [nodes]);

  const routeActiveVisual = useMemo(
    () =>
      resolveRouteActiveVisual(
        activeRouteHighlight,
        executionProgress,
        buildingNodeIds,
        agentIdToNodeId,
      ),
    [activeRouteHighlight, executionProgress, buildingNodeIds, agentIdToNodeId],
  );

  const routeOverlayAppliedRef = useRef(false);
  const routeOverlayKeyRef = useRef("");

  const routeOverlayKey = useMemo(() => {
    if (!activeRouteHighlight) return "";
    const lit = activeRouteHighlight.litSegmentIndices?.join(",") ?? "";
    return [
      activeRouteHighlight.fading ? "1" : "0",
      activeRouteHighlight.signalPhase ?? "",
      activeRouteHighlight.signalTone ?? "",
      activeRouteHighlight.activeSegmentIndex ?? "",
      lit,
      [...routeActiveVisual.activeEdgeIds].sort().join(","),
      [...routeActiveVisual.activeNodeIds].sort().join(","),
      [...routeActiveVisual.litEdgeIds].sort().join(","),
      [...routeActiveVisual.litNodeIds].sort().join(","),
    ].join("|");
  }, [activeRouteHighlight, routeActiveVisual]);

  useEffect(() => {
    const showRoute =
      executionProgress?.phase !== "error" &&
      executionProgress?.phase !== "complete" &&
      Boolean(activeRouteHighlight);

    if (!showRoute) {
      if (!routeOverlayAppliedRef.current) return;
      routeOverlayAppliedRef.current = false;
      routeOverlayKeyRef.current = "";
      setEdges((eds) =>
        eds.map((e) => {
          const connId = (e.data as ConnectionEdgeData)?.connectionId;
          return {
            ...e,
            data: {
              ...(e.data as object),
              highlighted: false,
              dimmed: false,
              routeFading: false,
              signalActive: false,
              signalPulse: false,
              signalLit: false,
              signalTone: undefined,
            },
            style: edgeStyleForConnection(connId, connectionsRef.current),
          };
        }),
      );
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          className: undefined,
          data: {
            ...(n.data as object),
            highlighted: false,
            routeStep: undefined,
            workflowStepBadge: undefined,
            dimmed: false,
            routeFading: false,
            tronPulse: false,
            agentWorking: false,
            signalPhase: undefined,
            signalTone: undefined,
            signalLit: false,
          },
        })),
      );
      return;
    }

    if (routeOverlayKey === routeOverlayKeyRef.current) return;
    routeOverlayKeyRef.current = routeOverlayKey;
    routeOverlayAppliedRef.current = true;

    const highlightedConnIds = new Set(activeRouteHighlight?.connectionIds ?? []);
    for (const segment of activeRouteHighlight?.animationSegments ?? []) {
      if (segment.kind === "edge") highlightedConnIds.add(segment.connectionId);
    }

    setEdges((eds) =>
      eds.map((e) => {
        const connId = (e.data as ConnectionEdgeData)?.connectionId;
        const inRoute = Boolean(connId && highlightedConnIds.has(connId));
        const signalLit = Boolean(connId && routeActiveVisual.litEdgeIds.has(connId));
        const signalPulse = Boolean(
          connId &&
            routeActiveVisual.activeEdgeIds.has(connId) &&
            !signalLit,
        );
        const routeLit = signalPulse || signalLit;
        const edgeTone = signalLit ? "success" : "active";
        return {
          ...e,
          data: {
            ...(e.data as object),
            highlighted: routeLit,
            dimmed: showRoute && !inRoute,
            routeFading: false,
            signalActive: Boolean(activeRouteHighlight?.signalActive),
            signalPulse,
            signalLit,
            signalTone: routeLit ? edgeTone : undefined,
            signalDirection: "forward",
          },
          style: routeLit
            ? undefined
            : edgeStyleForConnection(connId, connectionsRef.current),
        };
      }),
    );

    const stepByNode = new Map(activeRouteHighlight?.steps.map((s) => [s.nodeId, s]) ?? []);
    const routeNodeIds = new Set<string>();
    for (const segment of activeRouteHighlight?.animationSegments ?? []) {
      if (segment.kind === "node") routeNodeIds.add(segment.nodeId);
      if (segment.kind === "processing") {
        routeNodeIds.add(segment.chamberNodeId);
        for (const agentNodeId of segment.agentNodeIds) routeNodeIds.add(agentNodeId);
      }
    }
    const signalPhase = activeRouteHighlight?.signalPhase;

    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === "building") {
          return {
            ...n,
            className: undefined,
            data: {
              ...(n.data as object),
              highlighted: false,
              routeStep: undefined,
              workflowStepBadge: undefined,
              dimmed: showRoute,
              routeFading: false,
              tronPulse: false,
              agentWorking: false,
              signalPhase: undefined,
              signalTone: undefined,
              signalLit: false,
            },
          };
        }

        const step = stepByNode.get(n.id);
        const inRoute =
          n.type === "chamber" || n.type === "agent"
            ? routeNodeIds.has(n.id)
            : false;
        const isRevealedNode = routeActiveVisual.activeNodeIds.has(n.id);
        const isLitNode = routeActiveVisual.litNodeIds.has(n.id);
        const routeLit = isRevealedNode || isLitNode;
        const nodeSignalTone = isLitNode ? "success" : isRevealedNode ? "active" : undefined;
        const wfTarget = activeRouteHighlight?.workflowTargetNodeId;
        const wfCurrent = activeRouteHighlight?.workflowStepCurrent;
        const wfTotal = activeRouteHighlight?.workflowStepTotal;
        const workflowStepBadge =
          wfTarget && wfCurrent && wfTotal && n.id === wfTarget
            ? { current: wfCurrent, total: wfTotal }
            : undefined;
        return {
          ...n,
          className: inRoute ? "workspace-route-node" : undefined,
          data: {
            ...(n.data as object),
            highlighted: routeLit,
            routeStep: workflowStepBadge ? undefined : step?.step,
            workflowStepBadge,
            dimmed: showRoute && !routeLit,
            routeFading: false,
            tronPulse: routeLit,
            agentWorking: false,
            signalPhase,
            signalTone: nodeSignalTone,
            signalLit: isLitNode,
          },
        };
      }),
    );
  }, [
    activeRouteHighlight,
    routeActiveVisual,
    routeOverlayKey,
    executionProgress?.phase,
    setEdges,
    setNodes,
  ]);

  useEffect(() => {
    const showRoute =
      executionProgress?.phase !== "error" &&
      executionProgress?.phase !== "complete" &&
      Boolean(activeRouteHighlight);
    if (showRoute || loading) return;

    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== "agent") return n;
        const data = n.data as AgentNodeData;
        const eligible = isCostTierActiveForExecutionMode(data.costTier, executionMode);
        if (data.executionTierEligible === eligible) return n;
        return {
          ...n,
          data: {
            ...data,
            executionTierEligible: eligible,
          },
        };
      }),
    );
  }, [executionMode, executionProgress?.phase, activeRouteHighlight, loading, setNodes]);

  useEffect(() => {
    if (connectSourceId) setRouteSourceEntityId(connectSourceId);
  }, [connectSourceId, setRouteSourceEntityId]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const agentDragAllowed = !(connectMode && connectFromMenu);
        const draggable = !spacePanActive && (n.type !== "agent" ? true : agentDragAllowed);

        if (n.type === "chamber") {
          return {
            ...n,
            draggable,
            data: {
              ...(n.data as ChamberNodeData),
              connectPickable: connectMode,
              connectSelected:
                connectMode &&
                connectFromMenu &&
                connectSourceId != null &&
                nodeToEntityRegistryId(n) === connectSourceId,
            },
          };
        }
        if (n.type === "building") {
          return {
            ...n,
            draggable,
            data: {
              ...(n.data as BuildingNodeData),
              connectPickable: connectMode,
              connectSelected:
                connectMode &&
                connectFromMenu &&
                connectSourceId != null &&
                nodeToEntityRegistryId(n) === connectSourceId,
            },
          };
        }
        if (n.type === "agent") {
          return {
            ...n,
            draggable,
            selectable: !(connectMode && connectFromMenu),
            data: {
              ...(n.data as AgentNodeData),
              connectPickable: connectMode,
              connectSelected:
                connectMode &&
                connectFromMenu &&
                connectSourceId != null &&
                nodeToEntityRegistryId(n) === connectSourceId,
            },
          };
        }
        return n;
      }),
    );
  }, [connectMode, connectFromMenu, connectSourceId, spacePanActive, setNodes]);

  useEffect(() => {
    loadCanvas();
  }, [loadCanvas]);

  useEffect(() => {
    const warnPendingSaves = (event: BeforeUnloadEvent) => {
      if (pendingGeometrySavesRef.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnPendingSaves);
    return () => window.removeEventListener("beforeunload", warnPendingSaves);
  }, []);

  useEffect(() => {
    if (!paneMenu) return;
    const close = () => setPaneMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [paneMenu]);

  const [hasStoredViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!localStorage.getItem(viewportStorageKey(officeId));
    } catch {
      return false;
    }
  });


  const patchBuildingGeometry = useCallback(
    async (
      buildingId: string,
      payload: {
        position_x: number;
        position_z: number;
        size_w: number;
        size_d: number;
      },
    ) => {
      const res = await fetch(`/api/offices/${officeId}/objects/${buildingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Building update failed");
    },
    [officeId],
  );

  const patchChamberGeometry = useCallback(
    async (
      chamberId: string,
      buildingId: string,
      local: { x: number; z: number; width?: number; depth?: number },
    ) => {
      const res = await fetch(
        `/api/offices/${officeId}/buildings/${buildingId}/chambers/${chamberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(local),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Chamber update failed");
    },
    [officeId],
  );

  const patchAgentLayout = useCallback(
    async (
      chamberDbId: string,
      assignmentId: string,
      layout: { layout_x: number; layout_y: number; layout_size?: number },
    ) => {
      const res = await fetch(
        `/api/chambers/${chamberDbId}/assignments/${assignmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(layout),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Agent layout update failed");
    },
    [],
  );

  const updateEntityGeometry = useCallback(
    async (
      type: "building" | "chamber" | "agent",
      id: string,
      flowX: number,
      flowY: number,
      widthPx: number,
      heightPx: number,
      extraData?: {
        buildingId?: string;
        chamberId?: string;
        chamberDbId?: string;
        assignmentId?: string;
      },
    ) => {
      if (type === "building") {
        const center = flowNodeToBuildingCenter(flowX, flowY, widthPx, heightPx);
        const size_w = widthPx / WORKSPACE_UNIT_PX;
        const size_d = heightPx / WORKSPACE_UNIT_PX;
        await patchBuildingGeometry(id, { ...center, size_w, size_d });
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== id || n.type !== "building") return n;
            return withNodeDimensions(n, widthPx, heightPx, { x: flowX, y: flowY });
          }),
        );
      } else if (type === "chamber") {
        const buildingId = extraData?.buildingId;
        const chamberId = extraData?.chamberId;
        if (!buildingId || !chamberId) return;
        const { width: parentW, height: parentH } = parentBuildingSizePx(
          buildingId,
          nodesRef.current,
          (id) => rfInstanceRef.current?.getNode(id),
        );
        const clamped = clampChamberFlowGeometry(
          flowX,
          flowY,
          widthPx,
          heightPx,
          parentW,
          parentH,
        );
        const local = flowToChamberLocal(
          clamped.flowX,
          clamped.flowY,
          clamped.widthPx,
          clamped.heightPx,
          parentW,
          parentH,
        );
        const previous = routeLookupRef.current.chambers.find((c) => c.id === chamberId);
        routeLookupRef.current.chambers = routeLookupRef.current.chambers.map((c) =>
          c.id === chamberId
            ? { ...c, x: local.x, z: local.z, width: local.width, depth: local.depth }
            : c,
        );
        try {
          await patchChamberGeometry(chamberId, buildingId, local);
        } catch (err) {
          if (previous) {
            routeLookupRef.current.chambers = routeLookupRef.current.chambers.map((c) =>
              c.id === chamberId ? previous : c,
            );
          }
          throw err;
        }
        setNodes((nds) =>
          nds.map((n) => {
            const d = n.data as ChamberNodeData;
            if (d.chamberId !== chamberId) return n;
            return withNodeDimensions(n, clamped.widthPx, clamped.heightPx, {
              x: clamped.flowX,
              y: clamped.flowY,
            });
          }),
        );
      } else if (type === "agent") {
        const chamberDbId = extraData?.chamberDbId;
        const assignmentId = extraData?.assignmentId;
        if (!chamberDbId || !assignmentId) return;
        const chamberNode = nodesRef.current.find(
          (n) => (n.data as ChamberNodeData).chamberId === chamberDbId,
        );
        const parentId = chamberNode?.id;
        const parent = parentId ? rfInstanceRef.current?.getNode(parentId) : null;
        const { width: parentW, height: parentH } = nodeSizePx(parent, 48, 48);
        const clampedSize = clampAgentSizePx(Math.max(widthPx, heightPx));
        const clamped = clampAgentFlowGeometry(
          flowX,
          flowY,
          clampedSize,
          parentW,
          parentH,
        );
        const local = flowToAgentLocal(clamped.flowX, clamped.flowY, clampedSize, parentW, parentH);

        await patchAgentLayout(chamberDbId, assignmentId, {
          ...local,
          layout_size: clampedSize,
        });
        setNodes((nds) =>
          nds.map((n) => {
            const d = n.data as AgentNodeData;
            if (d.assignmentId !== assignmentId) return n;
            return {
              ...withNodeDimensions(n, clampedSize, clampedSize, {
                x: clamped.flowX,
                y: clamped.flowY,
              }),
              data: { ...d, layoutSizePx: clampedSize },
            };
          }),
        );
      }
    },
    [patchBuildingGeometry, patchChamberGeometry, patchAgentLayout, setNodes],
  );

  const persistBuilding = useCallback(
    (node: Node) => {
      const { width: w, height: h } = nodeSizePx(node, 192, 144);
      void updateEntityGeometry("building", node.id, node.position.x, node.position.y, w, h).catch(
        console.error,
      );
    },
    [updateEntityGeometry],
  );

  const persistBuildingGeometry = useCallback(
    async ({
      buildingId,
      flowX,
      flowY,
      widthPx,
      heightPx,
    }: {
      buildingId: string;
      flowX: number;
      flowY: number;
      widthPx: number;
      heightPx: number;
    }) => {
      await updateEntityGeometry("building", buildingId, flowX, flowY, widthPx, heightPx);
    },
    [updateEntityGeometry],
  );

  const persistChamberNode = useCallback(
    (node: Node) => {
      const d = node.data as ChamberNodeData;
      const chamberRow = routeLookupRef.current.chambers.find((c) => c.id === d.chamberId);
      const { widthPx, heightPx } = chamberDragSizePx(chamberRow);
      void enqueueGeometrySave(`chamber:${d.chamberId}`, async () => {
        const { width: parentW, height: parentH } = parentBuildingSizePx(
          d.buildingId,
          nodesRef.current,
          (id) => rfInstanceRef.current?.getNode(id),
        );
        const clamped = clampChamberFlowGeometry(
          node.position.x,
          node.position.y,
          widthPx,
          heightPx,
          parentW,
          parentH,
        );
        const local = flowToChamberLocal(
          clamped.flowX,
          clamped.flowY,
          clamped.widthPx,
          clamped.heightPx,
          parentW,
          parentH,
        );
        await patchChamberGeometry(d.chamberId, d.buildingId, { x: local.x, z: local.z });
        routeLookupRef.current.chambers = routeLookupRef.current.chambers.map((c) =>
          c.id === d.chamberId ? { ...c, x: local.x, z: local.z } : c,
        );
        setNodes((nds) =>
          nds.map((n) => {
            const nd = n.data as ChamberNodeData;
            if (nd.chamberId !== d.chamberId) return n;
            return { ...n, position: { x: clamped.flowX, y: clamped.flowY } };
          }),
        );
      }).catch((err) => {
        setError(err instanceof Error ? err.message : "Не удалось сохранить положение отдела");
      });
    },
    [enqueueGeometrySave, patchChamberGeometry, setNodes],
  );

  const persistAgentNode = useCallback(
    (node: Node) => {
      const d = node.data as AgentNodeData;
      const { width: w, height: h } = nodeSizePx(node, 80, 80);
      void updateEntityGeometry("agent", node.id, node.position.x, node.position.y, w, h, {
        chamberDbId: d.chamberDbId,
        assignmentId: d.assignmentId,
      }).catch(console.error);
    },
    [updateEntityGeometry],
  );

  const persistAgentGeometry = useCallback(
    async ({
      assignmentId,
      chamberDbId,
      flowX,
      flowY,
      sizePx,
    }: {
      assignmentId: string;
      chamberDbId: string;
      flowX: number;
      flowY: number;
      sizePx: number;
    }) => {
      await updateEntityGeometry("agent", assignmentId, flowX, flowY, sizePx, sizePx, {
        chamberDbId,
        assignmentId,
      });
    },
    [updateEntityGeometry],
  );

  const onNodeDragStart: OnNodeDrag = useCallback((_event, node) => {
    if (spacePanActiveRef.current) return;
    pushWorkspaceUndoRef.current();
    const getNode = (id: string) => rfInstanceRef.current?.getNode(id);
    if (!getNode) return;
    dragStartAbsoluteRef.current = nodeAbsolutePosition(node, getNode);
    setConnectionDragFollow({
      movingNodeIds: collectMovingNodeIds(node, nodesRef.current),
      dx: 0,
      dy: 0,
    });
  }, []);

  const onNodeDrag: OnNodeDrag = useCallback(
    (_event, node) => {
      const getNode = (id: string) => rfInstanceRef.current?.getNode(id);
      if (!getNode) return;
      const live = getNode(node.id) ?? node;
      const start = dragStartAbsoluteRef.current;
      if (start) {
        const current = nodeAbsolutePosition(live, getNode);
        setConnectionDragFollow({
          movingNodeIds: collectMovingNodeIds(live, nodesRef.current),
          dx: current.x - start.x,
          dy: current.y - start.y,
        });
      }
      for (const id of nodesToRefreshOnDrag(live, nodesRef.current, edgesRef.current)) {
        updateNodeInternals(id);
      }
    },
    [updateNodeInternals],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      const getNode = (id: string) => rfInstanceRef.current?.getNode(id);
      const live = getNode?.(node.id) ?? node;
      const start = dragStartAbsoluteRef.current;
      const moving = collectMovingNodeIds(live, nodesRef.current);

      if (start && getNode) {
        const current = nodeAbsolutePosition(live, getNode);
        const dx = current.x - start.x;
        const dy = current.y - start.y;
        applyDragRouteTranslation(
          dx,
          dy,
          moving,
          edgesRef.current,
          (connectionId) => {
            const edge = edgesRef.current.find(
              (e) => (e.data as ConnectionEdgeData)?.connectionId === connectionId,
            );
            const edgeRoute = (edge?.data as ConnectionEdgeData | undefined)?.routePath;
            if (edgeRoute?.points?.length) return edgeRoute;
            return connectionsRef.current.find((c) => c.id === connectionId)?.route_path;
          },
          (connectionId, routePath) => {
            void handleRoutePathChangeRef.current(connectionId, routePath);
          },
        );
      }

      dragStartAbsoluteRef.current = null;
      setConnectionDragFollow(null);

      if (live.type === "building") persistBuilding(live);
      if (live.type === "chamber") persistChamberNode(live);
      if (live.type === "agent") persistAgentNode(live);
      setConnectionLayoutTick((t) => t + 1);
    },
    [persistBuilding, persistChamberNode, persistAgentNode],
  );

  const clearRfSelection = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: false,
        ...(n.type === "agent" && n.className === "workspace-agent-chamber-resize-pass-through"
          ? { className: undefined }
          : {}),
      })),
    );
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
  }, [setNodes, setEdges]);

  const captureUndoSnapshot = useCallback((): WorkspaceUndoSnapshot => {
    return cloneWorkspaceUndoSnapshot({
      nodes: nodesRef.current,
      connections: connectionsRef.current,
      canvasBg: canvasBgRef.current,
      workspaceMeta: workspaceMetaRef.current,
      routeLookup: routeLookupRef.current,
      chamberCounts: chamberCountsRef.current,
    });
  }, []);

  const pushWorkspaceUndo = useCallback(() => {
    if (applyingUndoRef.current || loading) return;
    const snap = captureUndoSnapshot();
    setUndoStack((prev) => {
      const next = [...prev, snap];
      if (next.length > MAX_WORKSPACE_UNDO) next.shift();
      return next;
    });
  }, [captureUndoSnapshot, loading]);

  pushWorkspaceUndoRef.current = pushWorkspaceUndo;

  const recordUndoSnapshot = useCallback(() => {
    if (recordingResizeUndoRef.current) return;
    recordingResizeUndoRef.current = true;
    pushWorkspaceUndo();
  }, [pushWorkspaceUndo]);

  const finishResizeUndoRecord = useCallback(() => {
    recordingResizeUndoRef.current = false;
  }, []);

  const applyUndoSnapshot = useCallback(
    async (snap: WorkspaceUndoSnapshot) => {
      applyingUndoRef.current = true;
      try {
        workspaceMetaRef.current = structuredClone(snap.workspaceMeta);
        handleOverridesRef.current = snap.workspaceMeta.connection_handle_positions ?? {};
        connectionHandleAssignmentsRef.current =
          snap.workspaceMeta.connection_handle_assignments ?? {};
        extraHandlesRef.current = (snap.workspaceMeta.extra_connection_handles ?? {}) as Record<
          string,
          ConnectionHandleSlot[]
        >;
        routeLookupRef.current = structuredClone(snap.routeLookup);
        chamberCountsRef.current = new Map(snap.chamberCounts);
        connectionsRef.current = structuredClone(snap.connections);

        setCanvasBg(snap.canvasBg);
        setConnections(snap.connections);
        setNodes(structuredClone(snap.nodes));
        setConnectionLayoutTick((t) => t + 1);
        clearRfSelection();

        registerRouteLookup(routeLookupRef.current);
        registerSnapshot({
          officeId,
          cityName: cityNameRef.current,
          chambers: routeLookupRef.current.chambers,
          buildings: routeLookupRef.current.buildings,
          connections: snap.connections,
        });

        const snapNodes = snap.nodes;
        await syncWorkspaceUndoSnapshot({
          officeId,
          snapshot: snap,
          parentSizeForChamber: (buildingId, fallbackW, fallbackH) =>
            nodeSizePx(
              snapNodes.find((n) => n.id === buildingId && n.type === "building"),
              fallbackW,
              fallbackH,
            ),
          parentSizeForAgent: (chamberRegistryId, fallbackW, fallbackH) =>
            nodeSizePx(
              chamberRegistryId
                ? snapNodes.find((n) => n.id === chamberRegistryId && n.type === "chamber")
                : null,
              fallbackW,
              fallbackH,
            ),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось отменить действие");
      } finally {
        applyingUndoRef.current = false;
      }
    },
    [clearRfSelection, officeId, registerRouteLookup, registerSnapshot, setNodes],
  );

  const undoLastAction = useCallback(() => {
    if (connectModeRef.current) return;
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const snap = next.pop()!;
      void applyUndoSnapshot(snap);
      return next;
    });
  }, [applyUndoSnapshot]);

  const applyCanvasSelection = useCallback(
    (targets: InspectorTarget[], primary?: InspectorTarget | null) => {
      setSelection(targets, primary);
    },
    [setSelection],
  );

  const openInspectorForNode = useCallback(
    (node: Node) => {
      const ctx = selectionCtxRef.current;
      if (!ctx) return;
      const target = resolveTargetFromNode(node, ctx);
      if (!target) return;
      clearRfSelection();
      openInspector(target);
    },
    [clearRfSelection, openInspector],
  );

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }) => {
      if (connectModeRef.current) return;
      if (inspectorOpen) return;

      const ctx = selectionCtxRef.current;
      if (!ctx) return;

      const targets = resolveTargetsFromGraphSelection(selectedNodes, selectedEdges, ctx);
      applyCanvasSelection(targets);

      const selectedChamberIds = new Set(
        selectedNodes.filter((n) => n.type === "chamber").map((n) => n.id),
      );
      setNodes((nds) => {
        const chamberIdsToRefresh: string[] = [];
        const next = nds.map((n) => {
          if (n.type === "agent") {
            const passThrough = Boolean(n.parentId && selectedChamberIds.has(n.parentId));
            const nextClass = passThrough ? "workspace-agent-chamber-resize-pass-through" : undefined;
            if (n.className === nextClass) return n;
            return { ...n, className: nextClass };
          }
          if (n.type === "chamber" && selectedChamberIds.has(n.id)) {
            const normalized = normalizeNodeDimensions(n);
            if (normalized !== n) chamberIdsToRefresh.push(n.id);
            return normalized;
          }
          return n;
        });
        if (chamberIdsToRefresh.length > 0) {
          requestAnimationFrame(() => {
            for (const id of chamberIdsToRefresh) {
              updateNodeInternals(id);
            }
          });
        }
        return next;
      });
    },
    [applyCanvasSelection, inspectorOpen, setNodes, updateNodeInternals],
  );

  const openBuildingInspector = useCallback(
    (buildingId: string) => {
      const node = nodesRef.current.find((n) => n.id === buildingId && n.type === "building");
      if (!node) return;
      const d = node.data as BuildingNodeData;
      openInspector({
        kind: "building",
        officeId,
        buildingId: d.buildingId,
        label: d.label,
      });
    },
    [officeId, openInspector],
  );

  const pickConnectEntity = useCallback(
    (registryId: string) => {
      if (!connectModeRef.current || connectSavingRef.current || blockClickConnectRef.current) {
        return;
      }
      const node = findNodeByEntityRegistryId(nodesRef.current, registryId);
      if (!node || !isConnectableNode(node)) return;
      if (!connectSourceIdRef.current) {
        setConnectSourceId(registryId);
        return;
      }
      if (connectSourceIdRef.current === registryId) return;
      void createConnectionRef.current(connectSourceIdRef.current, registryId);
    },
    [],
  );

  const selectAllOnCanvas = useCallback(() => {
    if (connectModeRef.current) return;
    const ctx = selectionCtxRef.current;
    if (!ctx) return;

    const nextNodes = nodesRef.current.map((n) => ({
      ...n,
      selected: isMarqueeSelectableNode(n),
    }));
    const nextEdges = edgesRef.current.map((e) => ({ ...e, selected: true }));

    setNodes(nextNodes);
    setEdges(nextEdges);

    const targets = resolveTargetsFromGraphSelection(
      nextNodes.filter((n) => n.selected),
      nextEdges.filter((e) => e.selected),
      ctx,
    );
    applyCanvasSelection(targets);
  }, [setNodes, setEdges, applyCanvasSelection]);

  const clearCanvasSelection = useCallback(() => {
    clearRfSelection();
    setSelection([], null);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...(n.data as object),
          selected: false,
          hovered: false,
        },
      })),
    );
  }, [clearRfSelection, setSelection, setNodes]);

  const deleteSelectedDeletable = useCallback(async (override?: InspectorTarget[]) => {
    const targets = (override ?? selectedTargets).filter(
      (t) => t.kind === "agent" || t.kind === "connection",
    );
    const { agents, connections, total } = countDeletableTargets(targets);
    if (total === 0) return;

    const label =
      agents && connections
        ? `${agents} agent(s) and ${connections} connection(s)`
        : agents
          ? `${agents} agent assignment(s)`
          : `${connections} connection(s)`;

    if (!window.confirm(`Delete ${label}?`)) return;

    pushWorkspaceUndoRef.current();
    setError(null);

    for (const target of targets) {
      if (target.kind === "connection") {
        const res = await fetch(`/api/connections/${target.connectionId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          setError(body.error ?? "Connection delete failed");
          continue;
        }
        removeConnectionFromCanvas(target.connectionId);
      } else if (target.kind === "agent") {
        const res = await fetch(
          `/api/chambers/${target.chamberId}/assignments/${target.assignmentId}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          setError(body.error ?? "Assignment delete failed");
          continue;
        }
        setNodes((nds) =>
          nds.filter((n) => n.id !== workspaceAssignmentNodeId(target.assignmentId)),
        );
      }
    }

    clearCanvasSelection();
  }, [selectedTargets, clearCanvasSelection, removeConnectionFromCanvas, setNodes]);

  const appendBuildingNode = useCallback(
    (object: OfficeObjectRow, options?: { startEditing?: boolean }) => {
      const sizeW = object.size_w ?? DEFAULT_BUILDING.size_w;
      const sizeD = object.size_d ?? DEFAULT_BUILDING.size_d;
      const layout = buildingToFlowNode(
        object.position_x,
        object.position_z,
        sizeW,
        sizeD,
      );
      const cityHall = isCityHallBuilding(object);
      const accentIndex = resolveBuildingAccentIndex(object.color, object.id, cityHall);

      setNodes((nds) => [
        ...nds,
        withNodeDimensions(
          {
            id: object.id,
            type: "building" as const,
            position: { x: layout.x, y: layout.y },
            data: {
              label: object.label || `Building ${object.id.slice(0, 8)}`,
              buildingId: object.id,
              officeId,
              isCityHall: cityHall,
              accentIndex,
              startEditing: options?.startEditing,
              chamberCount: 0,
              agentCount: 0,
            } satisfies BuildingNodeData,
            style: {
              width: layout.width,
              height: layout.height,
              ...buildingAccentCssVars(accentIndex),
            },
            draggable: true,
            selectable: true,
            dragHandle: WORKSPACE_NODE_DRAG_HANDLE,
          },
          layout.width,
          layout.height,
        ),
      ]);
    },
    [setNodes],
  );

  const createBuildingAt = useCallback(
    async (flowCenter: XYPosition, name: string, routingDescription: string) => {
      pushWorkspaceUndoRef.current();
      setCreating(true);
      setError(null);
      try {
        const sizeW = DEFAULT_BUILDING.size_w;
        const sizeD = DEFAULT_BUILDING.size_d;
        const width = sizeW * WORKSPACE_UNIT_PX;
        const height = sizeD * WORKSPACE_UNIT_PX;
        const center = flowNodeToBuildingCenter(
          flowCenter.x - width / 2,
          flowCenter.y - height / 2,
          width,
          height,
        );

        const res = await fetch(`/api/offices/${officeId}/objects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            object_type: "room",
            label: name,
            routing_description: routingDescription,
            position_x: center.position_x,
            position_z: center.position_z,
            size_w: sizeW,
            size_d: sizeD,
          }),
        });
        const data = (await res.json()) as {
          object?: OfficeObjectRow;
          error?: string;
        };
        if (!res.ok || !data.object) {
          throw new Error(data.error ?? "Не удалось создать здание");
        }

        appendBuildingNode(data.object);
        routeLookupRef.current.buildings.push(data.object);
        chamberCountsRef.current.set(data.object.id, 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка создания");
      } finally {
        setCreating(false);
      }
    },
    [appendBuildingNode, officeId],
  );

  const appendChamberNode = useCallback(
    (
      chamber: ChamberRow,
      buildingId: string,
      options?: { startEditing?: boolean },
    ) => {
      setNodes((nds) => {
        const buildingNode = nds.find((n) => n.id === buildingId);
        const { width: parentW, height: parentH } = nodeSizePx(buildingNode, 192, 144);
        const cw = Number(chamber.width) || DEFAULT_CHAMBER.width;
        const cd = Number(chamber.depth) || DEFAULT_CHAMBER.depth;
        const layout = chamberToFlowPosition(
          Number(chamber.x) || 0,
          Number(chamber.z) || 0,
          cw,
          cd,
          parentW,
          parentH,
        );
        const entityId = chamber.entity_registry_id || chamber.id;
        const chamberNode = withNodeDimensions(
          {
            id: entityId,
            type: "chamber" as const,
            parentId: buildingId,
            extent: "parent" as const,
            position: { x: layout.x, y: layout.y },
            data: {
              label: chamber.name,
              routingDescription: chamber.entity_registry?.routing_description ?? null,
              chamberId: chamber.id,
              buildingId,
              entityRegistryId: entityId,
              officeId,
              agentCount: 0,
              startEditing: options?.startEditing,
            } satisfies ChamberNodeData,
            style: { width: layout.width, height: layout.height },
            draggable: true,
            selectable: true,
            dragHandle: WORKSPACE_NODE_DRAG_HANDLE,
          },
          layout.width,
          layout.height,
        );
        return [...bumpBuildingMetrics(nds, buildingId, { chambers: 1 }), chamberNode];
      });
    },
    [setNodes],
  );

  const createChamber = useCallback(
    async (buildingId: string, name?: string, routingDescription?: string) => {
      if (!name?.trim()) {
        setChamberCreateBuildingId(buildingId);
        return;
      }
      pushWorkspaceUndoRef.current();
      setError(null);
      setCreatingChamber(true);
      try {
        const existingCount = nodesRef.current.filter(
          (n) => n.parentId === buildingId,
        ).length;
        const local = defaultChamberLocalPosition(existingCount);

        const res = await fetch(
          `/api/offices/${officeId}/buildings/${buildingId}/chambers`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              routing_description: routingDescription,
              ...local,
            }),
          },
        );
        const data = (await res.json()) as {
          chamber?: ChamberRow;
          error?: string;
        };
        if (!res.ok || !data.chamber) {
          throw new Error(data.error ?? "Не удалось создать отдел");
        }

        appendChamberNode(data.chamber, buildingId, { startEditing: false });
        const entityId = data.chamber.entity_registry_id || data.chamber.id;
        requestAnimationFrame(() => {
          updateNodeInternals(entityId);
        });
        routeLookupRef.current.chambers.push(data.chamber);
        chamberCountsRef.current.set(
          buildingId,
          getBuildingChamberCount(chamberCountsRef.current, buildingId) + 1,
        );
      } finally {
        setCreatingChamber(false);
      }
    },
    [appendChamberNode, officeId, updateNodeInternals],
  );

  const appendAssignmentNode = useCallback(
    (assignment: AgentAssignmentRow) => {
      if (!assignment.agents) return;

      pushWorkspaceUndoRef.current();

      const chamberRow = routeLookupRef.current.chambers.find(
        (c) => c.id === assignment.chamber_id,
      );
      const managerAgentId = chamberRow?.manager_agent_id ?? null;

      setNodes((nds) => {
        const chamberNode = nds.find(
          (n) =>
            n.type === "chamber" &&
            (n.data as ChamberNodeData).chamberId === assignment.chamber_id,
        );
        if (!chamberNode) return nds;

        const chamberData = chamberNode.data as ChamberNodeData;
        const { width: chamberW, height: chamberH } = nodeSizePx(chamberNode, 48, 48);
        const agentIndex = nds.filter(
          (n) => n.type === "agent" && n.parentId === chamberNode.id,
        ).length;

        const agentNode = buildAgentAssignmentNode({
          assignment,
          chamberRegistryId: chamberNode.id,
          chamberDbId: chamberData.chamberId,
          officeId,
          chamberWidthPx: chamberW,
          chamberHeightPx: chamberH,
          managerAgentId,
          agentIndex,
        });
        if (!agentNode) return nds;

        let next = [...nds, agentNode];
        next = bumpChamberAgentCount(next, chamberNode.id, 1);
        if (chamberData.buildingId) {
          next = bumpBuildingMetrics(next, chamberData.buildingId, { agents: 1 });
        }
        return next;
      });

      routeLookupRef.current.assignments.push(assignment);
    },
    [setNodes],
  );

  const renameChamber = useCallback(
    async (chamberId: string, buildingId: string, name: string) => {
      const res = await fetch(
        `/api/offices/${officeId}/buildings/${buildingId}/chambers/${chamberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Rename failed");

      setNodes((nds) =>
        nds.map((n) => {
          const d = n.data as ChamberNodeData;
          if (d.chamberId !== chamberId) return n;
          return {
            ...n,
            data: { ...d, label: name, startEditing: false },
          };
        }),
      );
    },
    [officeId, setNodes],
  );

  const updateChamberRoutingDescription = useCallback(
    (registryId: string, routingDescription: string | null) => {
      routeLookupRef.current = {
        ...routeLookupRef.current,
        chambers: routeLookupRef.current.chambers.map((c) =>
          c.entity_registry_id === registryId
            ? {
                ...c,
                entity_registry: c.entity_registry
                  ? { ...c.entity_registry, routing_description: routingDescription }
                  : c.entity_registry,
              }
            : c,
        ),
      };
      registerSnapshot({
        officeId,
        cityName: cityNameRef.current,
        chambers: routeLookupRef.current.chambers,
        buildings: routeLookupRef.current.buildings,
        connections: connectionsRef.current,
      });
      setNodes((nds) =>
        nds.map((n) =>
          n.id === registryId && n.type === "chamber"
            ? {
                ...n,
                data: {
                  ...(n.data as ChamberNodeData),
                  routingDescription,
                },
              }
            : n,
        ),
      );
    },
    [officeId, registerSnapshot, setNodes],
  );

  const deleteChamber = useCallback(
    (chamberId: string, buildingId: string, entityRegistryId: string) => {
      void (async () => {
        pushWorkspaceUndoRef.current();
        const res = await fetch(
          `/api/offices/${officeId}/buildings/${buildingId}/chambers/${chamberId}`,
          { method: "DELETE" },
        );
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Не удалось удалить отдел");
          return;
        }
        const prev = getBuildingChamberCount(chamberCountsRef.current, buildingId);
        chamberCountsRef.current.set(buildingId, Math.max(0, prev - 1));
        setNodes((nds) => {
          const chamberNode = nds.find((n) => n.id === entityRegistryId);
          const buildingIdFromChamber = (chamberNode?.data as ChamberNodeData | undefined)?.buildingId;
          const agentDelta = (chamberNode?.data as ChamberNodeData | undefined)?.agentCount ?? 0;
          let next = nds.filter(
            (n) => n.id !== entityRegistryId && n.parentId !== entityRegistryId,
          );
          if (buildingIdFromChamber) {
            next = bumpBuildingMetrics(next, buildingIdFromChamber, {
              chambers: -1,
              agents: -agentDelta,
            });
          }
          return next;
        });
        setEdges((eds) =>
          eds.filter(
            (e) => e.source !== entityRegistryId && e.target !== entityRegistryId,
          ),
        );
      })();
    },
    [officeId, setEdges, setNodes],
  );

  const persistChamberGeometry = useCallback(
    async ({
      chamberId,
      buildingId,
      entityRegistryId,
      flowX,
      flowY,
      widthPx,
      heightPx,
    }: {
      chamberId: string;
      buildingId: string;
      entityRegistryId?: string;
      flowX: number;
      flowY: number;
      widthPx: number;
      heightPx: number;
    }) => {
      const chamberRow = routeLookupRef.current.chambers.find((c) => c.id === chamberId);
      const registryId =
        entityRegistryId ??
        routeLookupRef.current.chambers.find((c) => c.id === chamberId)?.entity_registry_id;
      const liveNode = registryId ? rfInstanceRef.current?.getNode(registryId) : null;
      const resolvedSize = resolveChamberResizeSizePx(liveNode, chamberRow, {
        widthPx,
        heightPx,
      });
      const resolvedPos = resolveChamberResizePosition(liveNode, { flowX, flowY });

      try {
        await enqueueGeometrySave(`chamber:${chamberId}`, () =>
          updateEntityGeometry(
            "chamber",
            registryId ?? chamberId,
            resolvedPos.flowX,
            resolvedPos.flowY,
            resolvedSize.widthPx,
            resolvedSize.heightPx,
            {
              buildingId,
              chamberId,
            },
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось сохранить размер отдела");
        throw err;
      }
    },
    [enqueueGeometrySave, updateEntityGeometry],
  );

  const renameBuilding = useCallback(
    async (buildingId: string, label: string) => {
      const res = await fetch(`/api/offices/${officeId}/objects/${buildingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Rename failed");

      setNodes((nds) =>
        nds.map((n) =>
          n.id === buildingId && n.type === "building"
            ? {
                ...n,
                data: { ...n.data, label, startEditing: false },
              }
            : n,
        ),
      );
    },
    [officeId, setNodes],
  );

  const requestDeleteBuilding = useCallback(
    (buildingId: string) => {
      const node = nodes.find((n) => n.id === buildingId);
      const buildingData = node?.data as BuildingNodeData | undefined;
      if (buildingData?.isCityHall) return;

      const count = getBuildingChamberCount(chamberCountsRef.current, buildingId);
      const label =
        (node?.data as { label?: string } | undefined)?.label ?? "Building";

      if (count > 0) {
        setDeleteBlocked({ buildingId, label, chamberCount: count });
        return;
      }

      void (async () => {
        pushWorkspaceUndoRef.current();
        const res = await fetch(`/api/offices/${officeId}/objects/${buildingId}`, {
          method: "DELETE",
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Delete failed");
          return;
        }
        chamberCountsRef.current.delete(buildingId);
        setNodes((nds) =>
          nds.filter((n) => n.id !== buildingId && n.parentId !== buildingId),
        );
      })();
    },
    [nodes, officeId, setNodes],
  );

  const setBuildingColor = useCallback(
    async (buildingId: string, paletteId: BuildingAccentId) => {
      const res = await fetch(`/api/offices/${officeId}/objects/${buildingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: paletteId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить цвет");

      const accentIndex = accentIndexFromPaletteId(paletteId) ?? 0;
      const accentVars = buildingAccentCssVars(accentIndex);
      routeLookupRef.current = {
        ...routeLookupRef.current,
        buildings: routeLookupRef.current.buildings.map((b) =>
          b.id === buildingId ? { ...b, color: paletteId } : b,
        ),
      };
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === buildingId && n.type === "building") {
            return {
              ...n,
              data: { ...(n.data as BuildingNodeData), accentIndex },
              style: { ...(n.style ?? {}), ...accentVars },
            };
          }
          if (n.parentId === buildingId && n.type === "chamber") {
            const cd = n.data as ChamberNodeData;
            if (cd.chamberColorId) return n;
            return {
              ...n,
              data: { ...cd, accentIndex },
              style: { ...(n.style ?? {}), ...accentVars },
            };
          }
          return n;
        }),
      );
    },
    [officeId, setNodes],
  );

  const setChamberColor = useCallback(
    async (
      buildingId: string,
      chamberId: string,
      registryId: string,
      paletteId: BuildingAccentId,
    ) => {
      const res = await fetch(
        `/api/offices/${officeId}/buildings/${buildingId}/chambers/${chamberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color: paletteId }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить цвет");

      const accentIndex = accentIndexFromPaletteId(paletteId) ?? 0;
      const accentVars = buildingAccentCssVars(accentIndex);
      routeLookupRef.current = {
        ...routeLookupRef.current,
        chambers: routeLookupRef.current.chambers.map((c) =>
          c.id === chamberId ? { ...c, color: paletteId } : c,
        ),
      };
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === registryId && n.type === "chamber") {
            return {
              ...n,
              data: {
                ...(n.data as ChamberNodeData),
                accentIndex,
                chamberColorId: paletteId,
              },
              style: { ...(n.style ?? {}), ...accentVars },
            };
          }
          return n;
        }),
      );
    },
    [officeId, setNodes],
  );

  const setAgentColor = useCallback(
    async (agentId: string, iconId: string) => {
      const res = await fetch(`/api/offices/${officeId}/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: iconId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить иконку");
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type === "agent" && (n.data as AgentNodeData).agentId === agentId) {
            return {
              ...n,
              data: {
                ...(n.data as AgentNodeData),
                agentIconId: iconId,
              },
            };
          }
          return n;
        }),
      );
    },
    [officeId, setNodes],
  );

  const setConnectionColor = useCallback(
    async (connectionId: string, paletteId: BuildingAccentId) => {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: paletteId }),
      });
      const data = (await res.json()) as {
        connection?: WorkspaceConnectionRow;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить цвет");

      const updated = data.connection;
      if (updated) {
        setConnections((prev) =>
          prev.map((c) => (c.id === connectionId ? { ...c, ...updated } : c)),
        );
      } else {
        setConnections((prev) =>
          prev.map((c) => (c.id === connectionId ? { ...c, color: paletteId } : c)),
        );
      }
      setConnectionLayoutTick((t) => t + 1);
    },
    [setConnections],
  );

  const persistHandlePositions = useCallback(
    async (positions: ConnectionHandleOverrides) => {
      workspaceMetaRef.current = {
        ...workspaceMetaRef.current,
        connection_handle_positions: positions,
      };
      const res = await fetch(`/api/offices/${officeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_meta: { connection_handle_positions: positions },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить позиции портов");
    },
    [officeId],
  );

  const persistConnectionHandleAssignment = useCallback(
    async (
      connectionId: string,
      sourceHandle: string,
      targetHandle: string,
    ) => {
      const next = {
        ...(connectionHandleAssignmentsRef.current ?? {}),
        [connectionId]: { sourceHandle, targetHandle },
      };
      connectionHandleAssignmentsRef.current = next;
      workspaceMetaRef.current = {
        ...workspaceMetaRef.current,
        connection_handle_assignments: next,
      };
      const res = await fetch(`/api/offices/${officeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_meta: { connection_handle_assignments: next },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить порты кабеля");
    },
    [officeId],
  );

  const repositionConnectionHandle = useCallback(
    (nodeId: string, handleId: string, perimeterPercent: number, persist: boolean) => {
      const nextOverrides: ConnectionHandleOverrides = {
        ...handleOverridesRef.current,
        [nodeId]: {
          ...(handleOverridesRef.current[nodeId] ?? {}),
          [handleId]: perimeterPercent,
        },
      };
      handleOverridesRef.current = nextOverrides;

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const handles = (n.data as { connectionHandles?: ConnectionHandleSlot[] }).connectionHandles;
          if (!handles?.length) return n;
          if (!handles.some((h) => h.id === handleId)) return n;
          const nextHandles = handles.map((h) =>
            h.id === handleId ? { ...h, perimeterPercent } : h,
          );
          return {
            ...n,
            data: {
              ...(n.data as object),
              connectionHandles: nextHandles,
            },
          };
        }),
      );

      updateNodeInternals(nodeId);

      if (!persist) return;

      pushWorkspaceUndoRef.current();
      setConnectionLayoutTick((t) => t + 1);

      if (handlePersistTimerRef.current) clearTimeout(handlePersistTimerRef.current);
      handlePersistTimerRef.current = setTimeout(() => {
        void persistHandlePositions(handleOverridesRef.current).catch((err) => {
          setError(err instanceof Error ? err.message : "Не удалось сохранить позиции портов");
        });
      }, 400);
    },
    [persistHandlePositions, setConnectionLayoutTick, setNodes, updateNodeInternals],
  );

  const persistExtraHandles = useCallback(
    async (extra: Record<string, ConnectionHandleSlot[]>) => {
      workspaceMetaRef.current = {
        ...workspaceMetaRef.current,
        extra_connection_handles: extra,
      };
      const res = await fetch(`/api/offices/${officeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_meta: { extra_connection_handles: extra },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить порты");
    },
    [officeId],
  );

  const addConnectionPort = useCallback(
    (nodeId: string, type: "source" | "target" = "source") => {
      pushWorkspaceUndoRef.current();
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      const existing = extraHandlesRef.current[nodeId] ?? [];
      const assigned = (node.data as { connectionHandles?: ConnectionHandleSlot[] }).connectionHandles ?? [];
      const ids = new Set([
        ...existing.map((h) => h.id),
        ...assigned.map((h) => h.id),
      ]);
      const portIndex = existing.filter((h) => h.type === type).length;
      const perimeterPercent = CUSTOM_PORT_PERCENTS[portIndex % CUSTOM_PORT_PERCENTS.length] ?? 50;
      const slot = createCustomHandleSlot(type, perimeterPercent, ids);
      const nextExtra = {
        ...extraHandlesRef.current,
        [nodeId]: [...existing, slot],
      };
      extraHandlesRef.current = nextExtra;
      setConnectionLayoutTick((t) => t + 1);
      void persistExtraHandles(nextExtra).catch((err) => {
        setError(err instanceof Error ? err.message : "Не удалось добавить порт");
      });
    },
    [persistExtraHandles],
  );

  const persistCanvasBg = useCallback(
    async (color: string) => {
      pushWorkspaceUndoRef.current();
      setCanvasBg(color);
      workspaceMetaRef.current = { ...workspaceMetaRef.current, canvas_bg: color };
      const res = await fetch(`/api/offices/${officeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_meta: { canvas_bg: color },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить цвет canvas");
    },
    [officeId],
  );

  const setTechDepartmentVisibleCounters = useCallback(
    async (counterIds: string[]) => {
      const normalized = normalizeVisibleTechCounters(counterIds);
      workspaceMetaRef.current = {
        ...workspaceMetaRef.current,
        tech_department_visible_counters: normalized,
      };
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== techDepartmentBuildingId) return n;
          return {
            ...n,
            data: {
              ...(n.data as BuildingNodeData),
              techDeptVisibleCounters: normalized,
            },
          };
        }),
      );
      const res = await fetch(`/api/offices/${officeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_meta: { tech_department_visible_counters: normalized },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить счётчики");
    },
    [officeId, setNodes],
  );

  const deleteAgentAssignment = useCallback(
    (assignmentId: string, chamberDbId: string) => {
      void (async () => {
        pushWorkspaceUndoRef.current();
        const res = await fetch(
          `/api/chambers/${chamberDbId}/assignments/${assignmentId}`,
          { method: "DELETE" },
        );
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Assignment delete failed");
          return;
        }
        setNodes((nds) => {
          const agentNode = nds.find((n) => n.id === workspaceAssignmentNodeId(assignmentId));
          if (!agentNode) {
            return nds.filter((n) => n.id !== workspaceAssignmentNodeId(assignmentId));
          }
          const chamberId = agentNodeRegistryId(agentNode);
          const buildingId = agentNodeBuildingId(nds, agentNode);
          let next = nds.filter((n) => n.id !== workspaceAssignmentNodeId(assignmentId));
          if (chamberId) next = bumpChamberAgentCount(next, chamberId, -1);
          if (buildingId) next = bumpBuildingMetrics(next, buildingId, { agents: -1 });
          return next;
        });
      })();
    },
    [setNodes],
  );

  const closeAddMenu = useCallback(() => {
    setAddMenuTarget(null);
    setAddMenuInitialStep(null);
  }, []);

  const openAddMenu = useCallback(
    (target: WorkspaceAddMenuTarget, initialStep?: WorkspaceAddMenuActionId) => {
      setAddMenuTarget(target);
      setAddMenuInitialStep(initialStep ?? null);
    },
    [],
  );

  const onMoveEnd = useCallback(
    (_event: unknown, viewport: { x: number; y: number; zoom: number }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(viewportStorageKey(officeId), JSON.stringify(viewport));
        } catch {
          /* ignore */
        }
      }, 300);
    },
    [],
  );

  const entityLabel = useCallback((registryId: string) => {
    const node = findNodeByEntityRegistryId(nodesRef.current, registryId);
    if (!node) return registryId.slice(0, 8);
    if (node.type === "chamber") return (node.data as ChamberNodeData).label;
    if (node.type === "building") return (node.data as BuildingNodeData).label;
    if (node.type === "agent") return (node.data as AgentNodeData).label;
    return registryId.slice(0, 8);
  }, []);

  const entityTypeForId = useCallback(
    (registryId: string): "chamber" | "building" | "agent" | null => {
      const registry = connectionRegistry();
      if (registry.chamberRegistryIds.has(registryId)) return "chamber";
      if (registry.buildingRegistryIds.has(registryId)) return "building";
      if (registry.agentRegistryIds.has(registryId)) return "agent";
      return null;
    },
    [connectionRegistry],
  );

  const resetConnectFlow = useCallback(() => {
    setConnectSourceId(null);
    setConnectFromMenu(false);
  }, []);

  const startConnectFrom = useCallback(
    (registryId: string) => {
      setConnectMode(true);
      setConnectSourceId(registryId);
      setConnectFromMenu(true);
      closeAddMenu();
    },
    [closeAddMenu],
  );

  const createConnection = useCallback(
    async (
      sourceId: string,
      targetId: string,
      handles?: {
        sourceNodeId: string;
        targetNodeId: string;
        sourceHandle: string | null;
        targetHandle: string | null;
      },
    ) => {
      if (connectSavingRef.current || createConnectionInFlightRef.current) return;
      if (sourceId === targetId) return;
      if (activeConnectionBetween(connectionsRef.current, sourceId, targetId)) {
        setError("Связь между этими объектами уже существует");
        resetConnectFlow();
        return;
      }

      createConnectionInFlightRef.current = true;
      connectSavingRef.current = true;
      pushWorkspaceUndoRef.current();
      setConnectSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_entity_id: sourceId,
            target_entity_id: targetId,
            ...NEW_CONNECTION_PERMISSIONS,
          }),
        });
        const data = (await res.json()) as {
          connection?: WorkspaceConnectionRow;
          error?: string;
        };
        if (!res.ok || !data.connection) {
          if (res.status === 409) {
            setError(data.error ?? "Связь между этими объектами уже существует");
            resetConnectFlow();
            return;
          }
          throw new Error(data.error ?? "Failed to create connection");
        }

        const sourceType = entityTypeForId(sourceId) ?? "chamber";
        const targetType = entityTypeForId(targetId) ?? "chamber";
        const enriched: WorkspaceConnectionRow = {
          ...data.connection,
          source: {
            name: entityLabel(sourceId),
            entity_type: sourceType,
          },
          target: {
            name: entityLabel(targetId),
            entity_type: targetType,
          },
        };

        if (handles?.sourceHandle && handles?.targetHandle) {
          const normalized = normalizeConnectionHandleAssignment({
            sourceHandle: handles.sourceHandle,
            targetHandle: handles.targetHandle,
          });
          connectionHandleAssignmentsRef.current = {
            ...connectionHandleAssignmentsRef.current,
            [enriched.id]: normalized,
          };
          await persistConnectionHandleAssignment(
            enriched.id,
            normalized.sourceHandle,
            normalized.targetHandle,
          );
        }

        setConnections((prev) => [enriched, ...prev]);
        setConnectionLayoutTick((t) => t + 1);
        setRouteSourceEntityId(sourceId);
        if (connectModeRef.current) {
          setConnectMode(false);
        }
        resetConnectFlow();
        openInspector({
          kind: "connection",
          connectionId: enriched.id,
          sourceRegistryId: sourceId,
          targetRegistryId: targetId,
          sourceLabel: entityLabel(sourceId),
          targetLabel: entityLabel(targetId),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
      } finally {
        createConnectionInFlightRef.current = false;
        connectSavingRef.current = false;
        setConnectSaving(false);
      }
    },
    [
      entityLabel,
      entityTypeForId,
      connectionRegistry,
      resetConnectFlow,
      setRouteSourceEntityId,
      openInspector,
      persistConnectionHandleAssignment,
    ],
  );

  useEffect(() => {
    createConnectionRef.current = createConnection;
  }, [createConnection]);

  const openAgentInspector = useCallback(
    (assignmentId: string) => {
      const node = nodesRef.current.find(
        (n) =>
          n.type === "agent" && (n.data as AgentNodeData).assignmentId === assignmentId,
      );
      if (node) openInspectorForNode(node);
    },
    [openInspectorForNode],
  );

  canvasActionsRef.current = {
    removeConnection: removeConnectionFromCanvas,
    updateConnection: (connection) => {
      setConnections((prev) =>
        prev.map((c) => (c.id === connection.id ? connection : c)),
      );
    },
    updateChamberLabel: (registryId, name) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === registryId
            ? { ...n, data: { ...(n.data as ChamberNodeData), label: name } }
            : n,
        ),
      );
    },
    updateChamberRoutingDescription,
    updateBuildingLabel: (buildingId, label) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === buildingId ? { ...n, data: { ...(n.data as object), label } } : n,
        ),
      );
    },
    removeAssignmentNode: (assignmentId) => {
      setNodes((nds) => {
        const agentNode = nds.find((n) => n.id === workspaceAssignmentNodeId(assignmentId));
        if (!agentNode) {
          return nds.filter((n) => n.id !== workspaceAssignmentNodeId(assignmentId));
        }
        const chamberId = agentNodeRegistryId(agentNode);
        const buildingId = agentNodeBuildingId(nds, agentNode);
        let next = nds.filter((n) => n.id !== workspaceAssignmentNodeId(assignmentId));
        if (chamberId) next = bumpChamberAgentCount(next, chamberId, -1);
        if (buildingId) next = bumpBuildingMetrics(next, buildingId, { agents: -1 });
        return next;
      });
      routeLookupRef.current.assignments = routeLookupRef.current.assignments.filter(
        (a) => a.id !== assignmentId,
      );
    },
    appendAssignmentNode,
    reloadCanvas: loadCanvas,
    selectTarget: setSelectedTarget,
    clearSelection: clearCanvasSelection,
    deleteSelectedDeletable,
    selectAllOnCanvas,
    openBuildingInspector,
    pickConnectEntity,
    renameBuilding,
    renameChamber,
    setBuildingColor,
    setChamberColor,
    setAgentColor,
    setConnectionColor,
    requestDeleteBuilding,
    deleteChamber,
    syncChamberRoutingRole: (chamberId, routingRole, clearedMainChamberIds = []) => {
      routeLookupRef.current.chambers = routeLookupRef.current.chambers.map((c) => {
        if (clearedMainChamberIds.includes(c.id)) {
          return { ...c, routing_role: null };
        }
        if (c.id === chamberId) {
          return { ...c, routing_role: routingRole };
        }
        return c;
      });
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type !== "chamber") return n;
          const d = n.data as ChamberNodeData;
          if (clearedMainChamberIds.includes(d.chamberId)) {
            return { ...n, data: { ...d, isMainChamber: false } };
          }
          if (d.chamberId === chamberId) {
            return { ...n, data: { ...d, isMainChamber: routingRole === "main" } };
          }
          return n;
        }),
      );
      registerSnapshot({
        officeId,
        cityName: cityNameRef.current,
        chambers: routeLookupRef.current.chambers,
        buildings: routeLookupRef.current.buildings,
        connections: connectionsRef.current,
      });
    },
    syncChamberManager: (chamberId, managerAgentId) => {
      routeLookupRef.current.chambers = routeLookupRef.current.chambers.map((c) =>
        c.id === chamberId ? { ...c, manager_agent_id: managerAgentId } : c,
      );
      registerSnapshot({
        officeId,
        cityName: cityNameRef.current,
        chambers: routeLookupRef.current.chambers,
        buildings: routeLookupRef.current.buildings,
        connections: connectionsRef.current,
      });
    },
  };

  useEffect(() => {
    registerActions({
      removeConnection: (...args) => canvasActionsRef.current!.removeConnection(...args),
      updateConnection: (...args) => canvasActionsRef.current!.updateConnection(...args),
      updateChamberLabel: (...args) => canvasActionsRef.current!.updateChamberLabel(...args),
      updateChamberRoutingDescription: (...args) =>
        canvasActionsRef.current!.updateChamberRoutingDescription(...args),
      updateBuildingLabel: (...args) => canvasActionsRef.current!.updateBuildingLabel(...args),
      removeAssignmentNode: (...args) => canvasActionsRef.current!.removeAssignmentNode(...args),
      appendAssignmentNode: (...args) => canvasActionsRef.current!.appendAssignmentNode(...args),
      reloadCanvas: () => canvasActionsRef.current!.reloadCanvas(),
      selectTarget: (...args) => canvasActionsRef.current!.selectTarget(...args),
      clearSelection: () => canvasActionsRef.current!.clearSelection(),
      deleteSelectedDeletable: (...args) => canvasActionsRef.current!.deleteSelectedDeletable(...args),
      selectAllOnCanvas: () => canvasActionsRef.current!.selectAllOnCanvas(),
      openBuildingInspector: (...args) => canvasActionsRef.current!.openBuildingInspector(...args),
      pickConnectEntity: (...args) => canvasActionsRef.current!.pickConnectEntity(...args),
      renameBuilding: (...args) => canvasActionsRef.current!.renameBuilding(...args),
      renameChamber: (...args) => canvasActionsRef.current!.renameChamber(...args),
      setBuildingColor: (...args) => canvasActionsRef.current!.setBuildingColor(...args),
      setChamberColor: (...args) => canvasActionsRef.current!.setChamberColor(...args),
      setAgentColor: (...args) => canvasActionsRef.current!.setAgentColor(...args),
      setConnectionColor: (...args) => canvasActionsRef.current!.setConnectionColor(...args),
      requestDeleteBuilding: (...args) => canvasActionsRef.current!.requestDeleteBuilding(...args),
      deleteChamber: (...args) => canvasActionsRef.current!.deleteChamber(...args),
      syncChamberRoutingRole: (...args) =>
        canvasActionsRef.current!.syncChamberRoutingRole(...args),
      syncChamberManager: (...args) => canvasActionsRef.current!.syncChamberManager(...args),
    });
  }, [registerActions]);

  const workspaceActions = useMemo(
    () => ({
      renameBuilding,
      requestDeleteBuilding,
      createChamber,
      renameChamber,
      deleteChamber,
      persistChamberGeometry,
      persistBuildingGeometry,
      persistAgentGeometry,
      repositionConnectionHandle,
      pickConnectEntity,
      startConnectFrom,
      openAddMenu,
      openAgentInspector,
      deleteAgentAssignment,
      setTechDepartmentVisibleCounters,
      addConnectionPort,
      recordUndoSnapshot,
      finishResizeUndoRecord,
    }),
    [
      renameBuilding,
      requestDeleteBuilding,
      createChamber,
      renameChamber,
      deleteChamber,
      persistChamberGeometry,
      persistBuildingGeometry,
      persistAgentGeometry,
      repositionConnectionHandle,
      pickConnectEntity,
      startConnectFrom,
      openAddMenu,
      openAgentInspector,
      deleteAgentAssignment,
      setTechDepartmentVisibleCounters,
      addConnectionPort,
      recordUndoSnapshot,
      finishResizeUndoRecord,
    ],
  );

  const toggleConnectMode = useCallback(() => {
    setConnectMode((v) => {
      if (!v) clearCanvasSelection();
      if (v) resetConnectFlow();
      else setConnectFromMenu(false);
      return !v;
    });
  }, [resetConnectFlow, clearCanvasSelection]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!connectMode || connectSavingRef.current || blockClickConnectRef.current) return;
      if (!isConnectableNode(node)) return;
      const registryId = nodeToEntityRegistryId(node);
      if (!registryId) return;
      if (!connectSourceId) {
        setConnectSourceId(registryId);
        return;
      }
      if (connectSourceId === registryId) return;
      void createConnectionRef.current(connectSourceId, registryId);
    },
    [connectMode, connectSourceId],
  );

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (connectModeRef.current) return;
      if (_event.shiftKey) return;
      openInspectorForNode(node);
    },
    [openInspectorForNode],
  );

  const openInspectorForEdge = useCallback(
    (edge: Edge) => {
      const ctx = selectionCtxRef.current;
      if (!ctx) return;
      const target = resolveInspectorTargetFromEdge(edge, ctx.nameByRegistryId);
      if (!target) return;
      clearRfSelection();
      openInspector(target);
    },
    [clearRfSelection, openInspector],
  );

  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      _event.stopPropagation();
      if (connectModeRef.current) return;
      openInspectorForEdge(edge);
    },
    [openInspectorForEdge],
  );

  useEffect(() => {
    openInspectorForEdgeRef.current = openInspectorForEdge;
  }, [openInspectorForEdge]);

  const selectEdgeForEditing = useCallback(
    (edge: Edge) => {
      if (connectModeRef.current) return;
      closeInspector();
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          selected: e.id === edge.id,
        })),
      );
    },
    [closeInspector, setEdges, setNodes],
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (connectModeRef.current || inspectorOpen || _event.shiftKey) return;
      selectEdgeForEditing(edge);
    },
    [inspectorOpen, selectEdgeForEditing],
  );

  useEffect(() => {
    selectEdgeForEditingRef.current = selectEdgeForEditing;
  }, [selectEdgeForEditing]);

  const isValidConnection = useCallback(
    (edgeOrConn: Edge | { source: string | null; target: string | null }) => {
      const source = edgeOrConn.source;
      const target = edgeOrConn.target;
      if (!source || !target || source === target) return false;
      const sourceNode = nodesRef.current.find((n) => n.id === source);
      const targetNode = nodesRef.current.find((n) => n.id === target);
      if (!sourceNode || !targetNode) return false;
      if (!isConnectableNode(sourceNode) || !isConnectableNode(targetNode)) return false;
      const sourceRegistry = nodeToEntityRegistryId(sourceNode);
      const targetRegistry = nodeToEntityRegistryId(targetNode);
      return Boolean(sourceRegistry && targetRegistry && sourceRegistry !== targetRegistry);
    },
    [],
  );

  const onConnect: OnConnect = useCallback((connection) => {
    if (
      !connectModeRef.current ||
      !connection.source ||
      !connection.target ||
      connectSavingRef.current ||
      createConnectionInFlightRef.current
    ) {
      return;
    }

    const sourceNode = nodesRef.current.find((n) => n.id === connection.source);
    const targetNode = nodesRef.current.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return;

    const sourceRegistryId = nodeToEntityRegistryId(sourceNode);
    const targetRegistryId = nodeToEntityRegistryId(targetNode);
    if (!sourceRegistryId || !targetRegistryId || sourceRegistryId === targetRegistryId) {
      return;
    }

    blockClickConnectRef.current = true;
    void createConnectionRef.current(sourceRegistryId, targetRegistryId, {
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
    }).finally(() => {
      window.setTimeout(() => {
        blockClickConnectRef.current = false;
      }, 150);
    });
  }, []);

  const onConnectStart = useCallback(() => {
    blockClickConnectRef.current = true;
  }, []);

  const onConnectEnd = useCallback(() => {
    window.setTimeout(() => {
      blockClickConnectRef.current = false;
    }, 150);
  }, []);

  const connectHint = connectMode
    ? connectFromMenu
      ? connectSourceId
        ? t.connectHintFromMenu(entityLabel(connectSourceId))
        : t.connectHintPickSource
      : connectSourceId
        ? t.connectHintPickTarget(entityLabel(connectSourceId))
        : t.connectHintDragHandles
    : null;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const isEditable = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (connectModeRef.current) {
        if (e.key === "Escape") {
          e.preventDefault();
          setConnectMode(false);
          resetConnectFlow();
          return;
        }
        if ((e.key === "n" || e.key === "N") && !isEditable(e.target)) {
          const selectedNodes = nodesRef.current.filter((n) => n.selected);
          if (selectedNodes.length === 1 && selectedNodes[0]) {
            e.preventDefault();
            addConnectionPort(selectedNodes[0].id);
          }
        }
        return;
      }
      if (isEditable(e.target)) return;

      if (e.code === "Space") {
        e.preventDefault();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (inspectorOpen) {
          closeInspector();
        } else {
          clearCanvasSelection();
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        void deleteSelectedDeletable();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAllOnCanvas();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undoLastAction();
      }
    };

    el.tabIndex = 0;
    const focusOnPointer = () => el.focus({ preventScroll: true });
    el.addEventListener("mousedown", focusOnPointer, true);
    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("mousedown", focusOnPointer, true);
      el.removeEventListener("keydown", onKeyDown);
    };
  }, [addConnectionPort, clearCanvasSelection, closeInspector, deleteSelectedDeletable, inspectorOpen, selectAllOnCanvas, resetConnectFlow, undoLastAction]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-400">
        {t.loading}
      </div>
    );
  }

  return (
    <WorkspaceActionsProvider value={workspaceActions}>
      <ConnectionDragFollowProvider value={connectionDragFollow}>
      <WorkspaceOverlayProvider
        nodesRef={nodesRef}
        setNodes={setNodes}
        setEdges={setEdges}
        onStackChange={setOverlayStackCount}
      >
      <div
        ref={wrapperRef}
        className="workspace-canvas-shell relative h-full w-full outline-none"
        data-testid="workspace-canvas-shell"
        tabIndex={0}
      >
        {error && (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded border border-red-800 bg-red-950/90 px-3 py-1.5 text-sm text-red-300">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 text-red-400 underline"
            >
              {t.dismiss}
            </button>
          </div>
        )}
        <div data-testid="workspace-edge-count" className="hidden" aria-hidden>
          {edges.length}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={(inst) => {
            rfInstanceRef.current = inst;
          }}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodeDragThreshold={6}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onEdgeClick={onEdgeClick}
          edgesFocusable
          elevateEdgesOnSelect
          elevateNodesOnSelect={false}
          onPaneClick={() => {
            if (!connectMode) closeInspector();
          }}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          nodesConnectable={connectMode}
          connectOnClick={connectMode}
          edgesReconnectable={false}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={72}
          autoPanOnConnect
          connectionLineStyle={{ stroke: "var(--accent-cyan)", strokeWidth: 2 }}
          connectionLineContainerStyle={{ zIndex: 1000 }}
          onSelectionChange={onSelectionChange}
          onMoveEnd={onMoveEnd}
          onPaneContextMenu={(e) => {
            e.preventDefault();
            const flow =
              rfInstanceRef.current?.screenToFlowPosition({
                x: e.clientX,
                y: e.clientY,
              }) ?? { x: 0, y: 0 };
            setPaneMenu({ clientX: e.clientX, clientY: e.clientY, flow });
          }}
          deleteKeyCode={null}
          panActivationKeyCode={connectMode ? null : "Space"}
          selectionOnDrag={!connectMode && !spacePanActive}
          selectionMode={SelectionMode.Partial}
          panOnDrag={spacePanActive ? true : [1, 2]}
          nodesDraggable={!connectMode && !spacePanActive}
          panOnScroll={false}
          preventScrolling
          multiSelectionKeyCode="Shift"
          defaultViewport={
            hasStoredViewport
              ? (() => {
                  try {
                    return JSON.parse(
                      localStorage.getItem(viewportStorageKey(officeId)) || "{}",
                    ) as { x: number; y: number; zoom: number };
                  } catch {
                    return { x: 0, y: 0, zoom: 0.85 };
                  }
                })()
              : { x: 0, y: 0, zoom: 0.85 }
          }
          minZoom={0.15}
          maxZoom={2}
          fitView={!hasStoredViewport}
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ zIndex: CONNECTION_EDGE_Z_INDEX }}
          className={`workspace-flow${overlayStackCount > 0 ? " workspace-overlay-active" : ""}${
            activeRouteHighlight ? " workspace-route-active" : ""
          }${connectMode ? " workspace-connect-active" : ""}${
            connectMode && connectFromMenu ? " workspace-connect-mode" : ""
          }${spacePanActive ? " workspace-pan-active" : ""}`}
          style={{ background: canvasBg }}
        >
          <Background variant={BackgroundVariant.Lines} gap={24} size={1} color="var(--border-soft)" />
          <Controls showInteractive={false} />
          <MiniMap
            className="workspace-minimap !bottom-12 !right-3"
            nodeColor={(node) => MINIMAP_NODE_COLORS[node.type ?? "default"] ?? MINIMAP_NODE_COLORS.default}
            maskColor="rgba(20, 20, 20, 0.75)"
            pannable
            zoomable
          />
          <FlowCenterToolbar
            wrapperRef={wrapperRef}
            rfInstance={rfInstanceRef}
            creating={creating}
            connectMode={connectMode}
            onToggleConnect={toggleConnectMode}
            connectHint={connectHint}
            selectionCount={selectedTargets.length}
            connectionCount={edges.length}
            canvasBg={canvasBg}
            onCanvasBgChange={(color) => void persistCanvasBg(color)}
            canUndo={undoStack.length > 0}
            undoCount={undoStack.length}
            onUndo={undoLastAction}
            onCreateAt={createBuildingAt}
          />
        </ReactFlow>

        {paneMenu && (
          <PaneContextMenuOverlay active>
            <PaneContextMenu
              x={paneMenu.clientX}
              y={paneMenu.clientY}
              label={t.paneAddBuilding}
              onAddBuilding={() => {
                setBuildingCreate({ flow: paneMenu.flow });
                setPaneMenu(null);
              }}
            />
          </PaneContextMenuOverlay>
        )}

        <BuildingCreateDialog
          open={buildingCreate !== null}
          title={t.paneAddBuilding}
          submitLabel={t.create}
          namePlaceholder={t.buildingNamePrompt}
          descriptionPlaceholder={t.buildingDescriptionPlaceholder}
          creating={creating}
          onCancel={() => setBuildingCreate(null)}
          onSubmit={({ name, routingDescription }) => {
            if (!buildingCreate) return;
            void createBuildingAt(buildingCreate.flow, name, routingDescription).finally(() => {
              setBuildingCreate(null);
            });
          }}
        />

        <DeleteBuildingModal
          open={deleteBlocked !== null}
          buildingId={deleteBlocked?.buildingId}
          chamberCount={deleteBlocked?.chamberCount ?? 0}
          buildingLabel={deleteBlocked?.label ?? ""}
          onClose={() => setDeleteBlocked(null)}
        />

        <ChamberCreateDialog
          open={chamberCreateBuildingId !== null}
          title="Создать новый отдел"
          submitLabel={t.create}
          namePlaceholder="Название отдела"
          descriptionPlaceholder="Чем занимается этот отдел? Опишите кратко..."
          creating={creatingChamber}
          onCancel={() => setChamberCreateBuildingId(null)}
          onSubmit={({ name, routingDescription }) => {
            if (!chamberCreateBuildingId) return;
            void createChamber(chamberCreateBuildingId, name, routingDescription).finally(() => {
              setChamberCreateBuildingId(null);
            });
          }}
        />

        <WorkspaceAddMenu
          target={addMenuTarget}
          initialStep={addMenuInitialStep}
          onClose={closeAddMenu}
          onCreateChamber={async (buildingId) => {
            setChamberCreateBuildingId(buildingId);
          }}
          onOpenInspector={openInspector}
          onOpenAgentInspector={openAgentInspector}
          onStartConnect={startConnectFrom}
          onAssignmentCreated={appendAssignmentNode}
          onSetBuildingColor={setBuildingColor}
          onSetChamberColor={setChamberColor}
        />
      </div>
      </WorkspaceOverlayProvider>
      </ConnectionDragFollowProvider>
    </WorkspaceActionsProvider>
  );
}

function PaneContextMenuOverlay({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  useWorkspaceOverlayLayer("pane-context-menu", active);
  return <>{children}</>;
}

function PaneContextMenu({
  x,
  y,
  label,
  onAddBuilding,
}: {
  x: number;
  y: number;
  label: string;
  onAddBuilding: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const panelStyle = useClampedPointPanelStyle(true, { x, y }, panelRef);

  return (
    <div
      ref={panelRef}
      className="min-w-[160px] rounded border border-stone-700 bg-stone-900 py-1 shadow-lg"
      style={panelStyle}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onAddBuilding}
        className="block w-full px-3 py-2 text-left text-sm text-stone-200 hover:bg-stone-800"
      >
        {label}
      </button>
    </div>
  );
}
