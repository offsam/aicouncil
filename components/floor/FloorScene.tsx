"use client";

import { CityViewModeToggle } from "@/components/city/CityViewModeToggle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildDefaultOfficeWalls } from "@/lib/default-office-layout";
import { getWorkFloorCenter, isObjectRowInBounds, isPositionInBounds, isRotatableObject } from "@/lib/office-bounds";
import {
  loadLocalLinks,
  newLocalLinkId,
  saveLocalLinks,
} from "@/lib/office-links-storage";
import {
  DEFAULT_OFFICE_PAINT,
  loadLocalPaint,
  saveLocalPaint,
  type OfficePaintSettings,
  type PaintTarget,
} from "@/lib/floor-paint-storage";
import {
  cutoutsFromPaint,
  cutoutsToPaintPatch,
  EMPTY_CUTOUTS,
  loadLocalCutouts,
  saveLocalCutouts,
  withBaseCutout,
  withRoomCutout,
  type FloorCutoutStore,
} from "@/lib/floor-cutouts-storage";
import { countVisibleRoomCells, roomCellBounds } from "@/lib/floor-cell-key";
import { cloneBuildSnapshot, MAX_BUILD_UNDO, type BuildSnapshot } from "@/lib/build-undo";
import { classifiedCellsInRect } from "@/lib/floor-erase-region";
import type { SnappedRect } from "@/lib/floor-grid";
import { wallSegmentsAfterErase } from "@/lib/wall-segment-erase";
import type { PastelId } from "@/lib/floor-pastel-palette";
import { getAgentVisual } from "@/lib/agent-visual";
import { loadLocalObjects, saveLocalObjects } from "@/lib/floor-objects-storage";
import type {
  AgentRow,
  OfficeLinkRow,
  OfficeObjectRow,
  OfficeObjectType,
  OfficeRow,
  ChamberRow,
  ConnectionRow,
} from "@/lib/office-types";
import { BuildingPanel } from "./BuildingPanel";
import { ChamberPanel } from "./ChamberPanel";
import {
  loadLocalRegistry,
  saveLocalRegistry,
  loadLocalChambers,
  saveLocalChambers,
} from "@/lib/entity-registry";
import {
  getSceneColors,
  paintFromOfficeRow,
  usePrefersDark,
} from "@/lib/use-prefers-dark";
import { BuildMenuLauncher, type AddMenuAction } from "./AddObjectMenu";
import { AgentDetailPanel } from "./AgentDetailPanel";
import { ColorPickerPanel } from "./ColorPickerPanel";
import { BuildingCreateDialog } from "@/components/workspace/BuildingCreateDialog";
import { ConnectionToolbar, EditorToolbar, MoveModeBar, SelectionMoveHint, SimsBuildBar } from "./EditorToolbar";
import { FloorEditorCanvas, type PlacementState } from "./FloorEditorCanvas";
import { UseModeCanvas } from "./UseModeCanvas";
import type { FloorViewState, AgentAssignmentRow } from "@/lib/office-types";
import type { WallStrokePlacement } from "@/lib/wall-draw";
import { ObjectContextMenu } from "./ObjectContextMenu";
import { OfficePanel } from "./OfficePanel";
import { PickAgentForDesk } from "./PickAgentForDesk";
import { MarqueeOverlay } from "./MarqueeOverlay";
import { DeleteHoverHint } from "./DeleteHoverHint";
import {
  type DeleteHoverTarget,
  getDeleteHoverLabel,
} from "@/lib/delete-hover";

interface FloorSceneProps {
  officeId: string;
  office: OfficeRow | null;
  initialObjects: OfficeObjectRow[];
  supabaseConfigured: boolean;
}

type PanelTab = "rules" | "knowledge";

function newLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

import { CITY, OBJECT_LABELS_CITY } from "@/lib/city-labels";
import { setRoutingSourceEntityId } from "@/lib/routing-source-storage";

export function FloorScene({
  officeId,
  office: initialOffice,
  initialObjects,
  supabaseConfigured,
}: FloorSceneProps) {
  const isDark = usePrefersDark();

  /*
   * Floor UI state groups (viewState is the navigation source of truth):
   *
   * VIEW NAVIGATION — mode/submode/building entry point
   *   viewState (city | use | edit + build | communications), cityViewCameraState
   *
   * EDIT BUILD SESSION — only when viewState.mode === "edit" && editSubMode === "build"
   *   deleteMode, moveMode, wallDraw*, roomDraw*, placement, cableMode (hub→room),
   *   undoStack, topDownView, overviewRequest
   *
   * COMMUNICATIONS SESSION — only when edit + communications
   *   connections, selectedConnectionId, editingConnection, cablingSourceChamber
   *   (Sprint 4 entity_registry connections — NOT office_links)
   *
   * SELECTION & PANELS — cross-mode except Use Mode hides most panels
   *   selectedObjectIds, selectedChamber, *PanelOpen, contextMenu, selectedAgentId
   *
   * SCENE DATA — persisted layout, shared across modes
   *   objects, allChambers, officeLinks, chamberAssignments, floorCutouts, officePaint
   *
   * LEGACY HUB CABLES (office_links table) — city/build only, separate from connections
   *   officeLinks, selectedLinkId, cableMode
   */

  const [officePaint, setOfficePaint] = useState<OfficePaintSettings>(() => {
    if (!supabaseConfigured) {
      return loadLocalPaint(officeId) ?? DEFAULT_OFFICE_PAINT;
    }
    return paintFromOfficeRow(initialOffice);
  });
  const [floorCutouts, setFloorCutouts] = useState<FloorCutoutStore>(() => {
    const fromPaint = cutoutsFromPaint(
      !supabaseConfigured
        ? loadLocalPaint(officeId) ?? DEFAULT_OFFICE_PAINT
        : paintFromOfficeRow(initialOffice),
    );
    const local = loadLocalCutouts(officeId);
    return local ?? fromPaint;
  });
  const [paintTarget, setPaintTarget] = useState<PaintTarget | null>(null);

  const sceneColors = getSceneColors(isDark, officePaint);

  const [office, setOffice] = useState(initialOffice);
  const [objects, setObjects] = useState<OfficeObjectRow[]>(() => {
    if (!supabaseConfigured) return loadLocalObjects(officeId) ?? initialObjects;
    return initialObjects;
  });
  const [officeLinks, setOfficeLinks] = useState<OfficeLinkRow[]>(() => {
    if (!supabaseConfigured) return loadLocalLinks(officeId) ?? [];
    return [];
  });
  const [activeAgentIds, setActiveAgentIds] = useState<string[]>([]);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [deskPickerOpen, setDeskPickerOpen] = useState(false);
  const [placement, setPlacement] = useState<PlacementState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; z: number } | null>(null);
  const [dragValid, setDragValid] = useState(true);

  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [cableMode, setCableMode] = useState(false);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [allChambers, setAllChambers] = useState<ChamberRow[]>([]);
  const [cablingSourceChamber, setCablingSourceChamber] = useState<ChamberRow | null>(null);
  const [editingConnection, setEditingConnection] = useState<ConnectionRow | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<import("@/lib/marquee-select").ScreenRect | null>(
    null,
  );
  const [groupDragOrigins, setGroupDragOrigins] = useState<Record<
    string,
    { x: number; z: number }
  > | null>(null);
  const [dragPositions, setDragPositions] = useState<Record<
    string,
    { x: number; z: number }
  > | null>(null);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [officePanelOpen, setOfficePanelOpen] = useState(false);
  const [buildingPanelOpen, setBuildingPanelOpen] = useState(false);
  const [chamberPanelOpen, setChamberPanelOpen] = useState(false);
  const [selectedChamber, setSelectedChamber] = useState<ChamberRow | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("rules");

  const [contextMenu, setContextMenu] = useState<{
    objectId: string;
    x: number;
    y: number;
  } | null>(null);

  const [deleteMode, setDeleteMode] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [moveDragReady, setMoveDragReady] = useState(false);
  const [deleteHoverTarget, setDeleteHoverTarget] = useState<DeleteHoverTarget | null>(null);
  const [wallDrawActive, setWallDrawActive] = useState(false);
  const [wallDrawDrawing, setWallDrawDrawing] = useState(false);
  const [roomDrawActive, setRoomDrawActive] = useState(false);
  const [roomDrawDrawing, setRoomDrawDrawing] = useState(false);
  const [roomLabelDraft, setRoomLabelDraft] = useState("");
  const [pendingRoomCreation, setPendingRoomCreation] = useState<{
    rect: SnappedRect;
    defaultName: string;
  } | null>(null);
  const [topDownView, setTopDownView] = useState(false);
  const [overviewRequest, setOverviewRequest] = useState(0);
  const [undoStack, setUndoStack] = useState<BuildSnapshot[]>([]);

  const [viewState, setViewState] = useState<FloorViewState>({
    mode: "city",
    selectedBuildingId: null,
  });
  const cityViewCameraState = useRef<{ position: [number, number, number]; target: [number, number, number] } | null>(null);

  /** Stable callback — save runs only on FloorEditorCanvas unmount (entering Use Mode). */
  const saveCityCamera = useCallback(
    (position: [number, number, number], target: [number, number, number]) => {
      cityViewCameraState.current = { position, target };
    },
    [],
  );

  const [chamberAssignments, setChamberAssignments] = useState<Record<string, AgentAssignmentRow[]>>({});

  const sceneSnapshotRef = useRef({
    objects,
    officeLinks,
    floorCutouts,
    officePaint,
  });
  useEffect(() => {
    sceneSnapshotRef.current = { objects, officeLinks, floorCutouts, officePaint };
  }, [objects, officeLinks, floorCutouts, officePaint]);

  useEffect(() => {
    if (chamberPanelOpen && selectedChamber) {
      setRoutingSourceEntityId(selectedChamber.entity_registry_id);
    } else if (!chamberPanelOpen) {
      setRoutingSourceEntityId(null);
    }
  }, [chamberPanelOpen, selectedChamber]);

  const buildModeActive =
    wallDrawActive ||
    roomDrawActive ||
    deleteMode ||
    cableMode ||
    Boolean(placement);

  function cancelEditorModes() {
    setDeleteMode(false);
    setMoveMode(false);
    setMoveDragReady(false);
    setDeleteHoverTarget(null);
    setWallDrawActive(false);
    setWallDrawDrawing(false);
    setRoomDrawActive(false);
    setRoomDrawDrawing(false);
    setTopDownView(false);
  }

  function finishBuildSession() {
    cancelEditorModes();
    setPlacement(null);
    cancelCableMode();
    setUndoStack([]);
  }

  const changeViewState = useCallback((nextState: FloorViewState) => {
    if (viewState.mode === "edit" && (nextState.mode !== "edit" || nextState.editSubMode !== "build")) {
      finishBuildSession();
    }
    setViewState(nextState);
  }, [viewState, finishBuildSession]);

  const pushBuildUndo = useCallback(() => {
    const snap = cloneBuildSnapshot(
      sceneSnapshotRef.current.objects,
      sceneSnapshotRef.current.officeLinks,
      sceneSnapshotRef.current.floorCutouts,
      sceneSnapshotRef.current.officePaint,
    );
    setUndoStack((prev) => {
      const next = [...prev, snap];
      if (next.length > MAX_BUILD_UNDO) next.shift();
      return next;
    });
  }, []);

  const applyBuildSnapshot = useCallback(
    (snap: BuildSnapshot) => {
      setObjects(snap.objects);
      setOfficeLinks(snap.officeLinks);
      setFloorCutouts(snap.floorCutouts);
      setOfficePaint(snap.officePaint);
      setDraggingId(null);
      setDragPosition(null);
      setDragPositions(null);
      setGroupDragOrigins(null);
      setSelectedObjectIds([]);
      setSelectedLinkId(null);
      setContextMenu(null);
      setPaintTarget(null);
      if (!supabaseConfigured) {
        saveLocalObjects(officeId, snap.objects);
        saveLocalLinks(officeId, snap.officeLinks);
        saveLocalCutouts(officeId, snap.floorCutouts);
        saveLocalPaint(officeId, snap.officePaint);
      }
    },
    [officeId, supabaseConfigured],
  );

  const undoBuild = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const restored = next.pop()!;
      applyBuildSnapshot(restored);
      return next;
    });
  }, [applyBuildSnapshot]);

  const persistLocal = useCallback(
    (next: OfficeObjectRow[]) => {
      if (!supabaseConfigured) saveLocalObjects(officeId, next);
    },
    [officeId, supabaseConfigured],
  );

  const persistLocalLinks = useCallback(
    (next: OfficeLinkRow[]) => {
      if (!supabaseConfigured) saveLocalLinks(officeId, next);
    },
    [officeId, supabaseConfigured],
  );

  const persistPaint = useCallback(
    async (next: OfficePaintSettings) => {
      setOfficePaint(next);
      if (!supabaseConfigured) {
        saveLocalPaint(officeId, next);
        return;
      }
      setOffice((prev) => (prev ? { ...prev, scene_paint: next } : prev));
      await fetch(`/api/offices/${officeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_paint: next }),
      }).catch(() => {});
    },
    [officeId, supabaseConfigured],
  );

  async function updateObjectColor(objectId: string, pastelId: PastelId) {
    if (!supabaseConfigured) {
      setObjects((prev) => {
        const next = prev.map((o) =>
          o.id === objectId ? { ...o, color: pastelId } : o,
        );
        persistLocal(next);
        return next;
      });
      return;
    }
    const res = await fetch(`/api/offices/${officeId}/objects/${objectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: pastelId }),
    });
    const data = (await res.json()) as { object?: OfficeObjectRow };
    if (data.object) {
      setObjects((prev) => prev.map((o) => (o.id === objectId ? data.object! : o)));
    }
  }

  async function updateObjectLabel(objectId: string, label: string) {
    const trimmed = label.trim();
    if (!supabaseConfigured) {
      setObjects((prev) => {
        const next = prev.map((o) =>
          o.id === objectId ? { ...o, label: trimmed || null } : o,
        );
        persistLocal(next);
        const localReg = loadLocalRegistry();
        const updated = localReg.map((r) =>
          r.id === objectId
            ? {
                ...r,
                name: trimmed || `Building ${objectId.substring(0, 8)}`,
              }
            : r
        );
        saveLocalRegistry(updated);
        return next;
      });
      return;
    }
    const res = await fetch(`/api/offices/${officeId}/objects/${objectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: trimmed || null }),
    });
    const data = (await res.json()) as { object?: OfficeObjectRow };
    if (data.object) {
      setObjects((prev) => prev.map((o) => (o.id === objectId ? data.object! : o)));
    }
  }

  function handlePaintPick(id: PastelId) {
    if (!paintTarget) return;
    if (paintTarget.kind === "wall" || paintTarget.kind === "room") {
      void updateObjectColor(paintTarget.objectId, id);
    }
    setPaintTarget(null);
  }

  async function createWall(stroke: WallStrokePlacement, recordUndo = true) {
    await createObject("wall", stroke.x, stroke.z, null, stroke.rotationY, {
      sizeW: stroke.length,
      recordUndo,
    });
  }

  const refreshObjects = useCallback(async () => {
    if (!supabaseConfigured) return;
    try {
      const res = await fetch(`/api/offices/${officeId}/objects`);
      const data = (await res.json()) as { objects?: OfficeObjectRow[] };
      if (data.objects) setObjects(data.objects);
    } catch {
      /* ignore */
    }
  }, [officeId, supabaseConfigured]);

  const refreshLinks = useCallback(async () => {
    if (!supabaseConfigured) return;
    try {
      const res = await fetch(`/api/offices/${officeId}/links`);
      const data = (await res.json()) as { links?: OfficeLinkRow[] };
      if (data.links) setOfficeLinks(data.links);
    } catch {
      /* ignore */
    }
  }, [officeId, supabaseConfigured]);

  const refreshChambers = useCallback(async () => {
    if (!supabaseConfigured) {
      setAllChambers(loadLocalChambers());
      return;
    }
    try {
      const res = await fetch("/api/chambers");
      const data = (await res.json()) as { chambers?: ChamberRow[] };
      if (data.chambers) setAllChambers(data.chambers);
    } catch {
      /* ignore */
    }
  }, [supabaseConfigured]);

  const refreshConnections = useCallback(async () => {
    if (!supabaseConfigured) return;
    try {
      const res = await fetch("/api/connections");
      const data = (await res.json()) as { connections?: ConnectionRow[] };
      if (data.connections) setConnections(data.connections);
    } catch {
      /* ignore */
    }
  }, [supabaseConfigured]);

  const refreshAssignments = useCallback(async () => {
    if (!supabaseConfigured) {
      const localReg = loadLocalRegistry();
      const newAssignments: Record<string, AgentAssignmentRow[]> = {};
      for (const chamb of allChambers) {
        const localAgents = localReg.filter(
          (r) => r.entity_type === "agent" && r.parent_entity_id === chamb.entity_registry_id
        );
        newAssignments[chamb.id] = localAgents.map((agent) => ({
          id: `assign-${agent.id}`,
          agent_id: agent.id,
          chamber_id: chamb.id,
          role: "Member",
          created_at: agent.created_at,
          agents: {
            id: agent.id,
            office_id: null,
            name: agent.name,
            provider: "local",
            model_id: "local",
            status: "online",
            created_at: agent.created_at,
          },
        }));
      }
      setChamberAssignments(newAssignments);
      return;
    }

    try {
      const res = await fetch("/api/chambers/assignments");
      const data = (await res.json()) as {
        assignmentsByChamber?: Record<string, AgentAssignmentRow[]>;
      };
      if (data.assignmentsByChamber) {
        setChamberAssignments(data.assignmentsByChamber);
      }
    } catch (err) {
      console.error("Failed to refresh assignments:", err);
    }
  }, [allChambers, supabaseConfigured]);

  useEffect(() => {
    if (viewState.mode === "use" || (viewState.mode === "edit" && viewState.editSubMode === "communications")) {
      void refreshAssignments();
    }
  }, [viewState.mode, viewState.editSubMode, allChambers, refreshAssignments]);

  async function deleteConnection(id: string) {
    if (!supabaseConfigured) return;
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      if (res.ok) void refreshConnections();
    } catch (err) {
      console.error("Failed to delete connection:", err);
    }
  }

  async function handleSaveConnection(payload: {
    priority: number;
    is_active: boolean;
    read_knowledge: boolean;
    read_rules: boolean;
    read_results: boolean;
    send_tasks: boolean;
  }) {
    if (!editingConnection) return;
    const isNew = editingConnection.id === "new";
    
    const url = isNew ? "/api/connections" : `/api/connections/${editingConnection.id}`;
    const method = isNew ? "POST" : "PATCH";

    const body = isNew
      ? {
          source_entity_id: editingConnection.source_entity_id,
          target_entity_id: editingConnection.target_entity_id,
          ...payload,
        }
      : payload;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Не удалось сохранить соединение");
    }

    void refreshConnections();
  }

  useEffect(() => {
    void refreshLinks();
    void refreshConnections();
    void refreshChambers();
  }, [refreshLinks, refreshConnections, refreshChambers]);

  useEffect(() => {
    if (!supabaseConfigured) return;

    let cancelled = false;
    let timeoutId = 0;
    let idleStreak = 0;
    const ACTIVE_POLL_MS = 2500;
    const IDLE_POLL_MS = 12000;
    const IDLE_STREAK_THRESHOLD = 3;

    function nextPollDelay(hasActiveAgents: boolean) {
      if (hasActiveAgents) {
        idleStreak = 0;
        return ACTIVE_POLL_MS;
      }
      idleStreak += 1;
      return idleStreak >= IDLE_STREAK_THRESHOLD ? IDLE_POLL_MS : ACTIVE_POLL_MS;
    }

    function schedulePoll(delayMs: number) {
      if (cancelled || document.hidden) return;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        void pollActiveFlows();
      }, delayMs);
    }

    async function pollActiveFlows() {
      if (cancelled || document.hidden) return;
      let delayMs = ACTIVE_POLL_MS;
      try {
        const r = await fetch(`/api/offices/${officeId}/active-flows`);
        const d = (await r.json()) as { activeAgentIds?: string[] };
        if (d.activeAgentIds) {
          setActiveAgentIds(d.activeAgentIds);
          delayMs = nextPollDelay(d.activeAgentIds.length > 0);
        }
      } catch {
        /* best-effort */
      }
      schedulePoll(delayMs);
    }

    function onVisibilityChange() {
      if (document.hidden) {
        window.clearTimeout(timeoutId);
        return;
      }
      idleStreak = 0;
      void pollActiveFlows();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    void pollActiveFlows();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [officeId, supabaseConfigured]);

  const visibleObjects = useMemo(
    () => objects.filter((o) => o.office_id === officeId),
    [objects, officeId],
  );

  const selectedObject =
    selectedObjectIds.length === 1
      ? (visibleObjects.find((o) => o.id === selectedObjectIds[0]) ?? null)
      : null;
  const selectedLink = officeLinks.find((l) => l.id === selectedLinkId) ?? null;

  const deleteHoverLabel = useMemo(
    () =>
      deleteMode
        ? getDeleteHoverLabel(deleteHoverTarget, visibleObjects, selectedObjectIds)
        : null,
    [deleteMode, deleteHoverTarget, visibleObjects, selectedObjectIds],
  );

  useEffect(() => {
    if (selectedObject?.object_type === "room") {
      setRoomLabelDraft(selectedObject.label ?? "");
    } else {
      setRoomLabelDraft("");
    }
  }, [selectedObject?.id, selectedObject?.label, selectedObject?.object_type]);

  function nextRoomLabel(): string {
    const count = visibleObjects.filter((o) => o.object_type === "room").length;
    return `${CITY.roomNamePrefix} ${count + 1}`;
  }

  function clearSelection() {
    setSelectedObjectIds([]);
    setSelectedLinkId(null);
    setContextMenu(null);
    setPaintTarget(null);
    setMarqueeRect(null);
    setMoveDragReady(false);
  }

  function cancelCableMode() {
    setCableMode(false);
  }

  function startPlacement(type: OfficeObjectType, agent: AgentRow | null = null) {
    cancelCableMode();
    cancelEditorModes();
    clearSelection();
    const center = getWorkFloorCenter();
    setPlacement({
      objectType: type,
      agent,
      x: center.x,
      z: center.z,
      rotationY: 0,
      valid: isPositionInBounds(center.x, center.z, type, 0),
    });
    setAddMenuOpen(false);
    setDeskPickerOpen(false);
  }

  async function createObject(
    type: OfficeObjectType,
    x: number,
    z: number,
    agent: AgentRow | null,
    rotationY = 0,
    opts?: {
      color?: string | null;
      sizeW?: number;
      sizeD?: number;
      label?: string | null;
      routingDescription?: string | null;
      recordUndo?: boolean;
    },
  ) {
    if (opts?.recordUndo !== false) pushBuildUndo();
    if (!supabaseConfigured) {
      const row: OfficeObjectRow = {
        id: newLocalId(),
        office_id: officeId,
        object_type: type,
        position_x: x,
        position_z: z,
        rotation_y: rotationY,
        agent_id: agent?.id ?? null,
        color: opts?.color ?? null,
        size_w: opts?.sizeW ?? null,
        size_d: opts?.sizeD ?? null,
        label: type === "room" ? (opts?.label ?? null) : null,
        created_at: new Date().toISOString(),
        agents: agent,
      };
      setObjects((prev) => {
        const next = [...prev, row];
        persistLocal(next);
        if (type === "room") {
          const localReg = loadLocalRegistry();
          localReg.push({
            id: row.id,
            entity_type: "building",
            name: row.label || `Building ${row.id.substring(0, 8)}`,
            slug: `building-${row.id.substring(0, 8)}`,
            parent_entity_id: officeId,
            routing_description: opts?.routingDescription?.trim() || null,
            created_at: row.created_at,
          });
          saveLocalRegistry(localReg);
        }
        return next;
      });
      return;
    }

    const res = await fetch(`/api/offices/${officeId}/objects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        object_type: type,
        position_x: x,
        position_z: z,
        rotation_y: rotationY,
        agent_id: type === "desk" ? agent?.id : null,
        color: opts?.color ?? null,
        size_w: type === "room" || type === "wall" ? opts?.sizeW : null,
        size_d: type === "room" ? opts?.sizeD : null,
        label: type === "room" ? (opts?.label ?? null) : null,
        routing_description: type === "room" ? (opts?.routingDescription ?? null) : null,
      }),
    });
    const data = (await res.json()) as { object?: OfficeObjectRow; error?: string };
    if (!res.ok || !data.object) throw new Error(data.error ?? "Не удалось создать объект");
    setObjects((prev) => [...prev, data.object!]);
  }

  function createRoom(rect: SnappedRect) {
    setPendingRoomCreation({
      rect,
      defaultName: nextRoomLabel(),
    });
  }

  async function confirmPendingRoomCreation(name: string, routingDescription: string) {
    if (!pendingRoomCreation) return;
    const { rect } = pendingRoomCreation;
    try {
      await createObject("room", rect.centerX, rect.centerZ, null, 0, {
        color: "cream",
        sizeW: rect.width,
        sizeD: rect.depth,
        label: name,
        routingDescription,
      });
    } finally {
      setPendingRoomCreation(null);
    }
  }

  async function seedDefaultWalls() {
    pushBuildUndo();
    const walls = buildDefaultOfficeWalls(officeId);
    if (!supabaseConfigured) {
      setObjects((prev) => {
        const next = [...prev, ...walls];
        persistLocal(next);
        return next;
      });
      return;
    }
    for (const wall of walls) {
      await fetch(`/api/offices/${officeId}/objects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object_type: wall.object_type,
          position_x: wall.position_x,
          position_z: wall.position_z,
          rotation_y: wall.rotation_y,
        }),
      });
    }
    void refreshObjects();
  }

  const updateObjectPositions = useCallback(
    async (
      updates: Array<{ id: string; x: number; z: number }>,
      opts?: { recordUndo?: boolean },
    ) => {
      if (updates.length === 0) return;
      if (opts?.recordUndo) pushBuildUndo();

      if (!supabaseConfigured) {
        setObjects((prev) => {
          const map = new Map(updates.map((u) => [u.id, u]));
          const next = prev.map((o) => {
            const u = map.get(o.id);
            return u ? { ...o, position_x: u.x, position_z: u.z } : o;
          });
          persistLocal(next);
          return next;
        });
        return;
      }

      // Calculate delta and update route_path of connections where both endpoints are moving
      const registryIds = new Set<string>();
      let dx = 0;
      let dy = 0;
      for (const u of updates) {
        const prev = objects.find((o) => o.id === u.id);
        if (prev) {
          dx = (u.x - prev.position_x) * 24;
          dy = (u.z - prev.position_z) * 24;
          registryIds.add(u.id);
          const buildingChambers = allChambers.filter((c) => c.building_object_id === u.id);
          for (const c of buildingChambers) {
            registryIds.add(c.entity_registry_id);
            const assigns = chamberAssignments[c.id] || [];
            for (const a of assigns) {
              if (a.agent_id) {
                registryIds.add(a.agent_id);
              }
            }
          }
        }
      }

      if (dx !== 0 || dy !== 0) {
        const patchPromises = [];
        for (const conn of connections) {
          const srcMoving = registryIds.has(conn.source_entity_id);
          const tgtMoving = registryIds.has(conn.target_entity_id);
          if (srcMoving && tgtMoving) {
            // Both endpoints are moving, translate the entire route path
            const routePath = conn.route_path;
            if (routePath?.points?.length) {
              const updatedPath = {
                version: 1,
                points: routePath.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
              };
              patchPromises.push(
                fetch(`/api/connections/${conn.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ route_path: updatedPath }),
                })
              );
            }
          }
        }
        if (patchPromises.length > 0) {
          await Promise.all(patchPromises).catch(console.error);
          void refreshConnections();
        }
      }

      await Promise.all(
        updates.map((u) =>
          fetch(`/api/offices/${officeId}/objects/${u.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position_x: u.x, position_z: u.z }),
          }),
        ),
      );
      void refreshObjects();
    },
    [
      allChambers,
      chamberAssignments,
      connections,
      objects,
      officeId,
      persistLocal,
      pushBuildUndo,
      refreshConnections,
      refreshObjects,
      supabaseConfigured,
    ],
  );

  const updateObjectPosition = useCallback(
    async (objectId: string, x: number, z: number, recordUndo = false) => {
      await updateObjectPositions([{ id: objectId, x, z }], { recordUndo });
    },
    [updateObjectPositions],
  );

  const updateObjectRotation = useCallback(
    async (objectId: string, rotationY: number) => {
      if (!supabaseConfigured) {
        setObjects((prev) => {
          const next = prev.map((o) =>
            o.id === objectId ? { ...o, rotation_y: rotationY } : o,
          );
          persistLocal(next);
          return next;
        });
        return;
      }
      const res = await fetch(`/api/offices/${officeId}/objects/${objectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotation_y: rotationY }),
      });
      const data = (await res.json()) as { object?: OfficeObjectRow; error?: string };
      if (!res.ok || !data.object) throw new Error(data.error ?? "Не удалось повернуть");
      setObjects((prev) => prev.map((o) => (o.id === objectId ? data.object! : o)));
    },
    [officeId, persistLocal, supabaseConfigured],
  );

  function rotateObject(objectId: string) {
    const obj = objects.find((o) => o.id === objectId);
    if (!obj || !isRotatableObject(obj.object_type)) return;
    void updateObjectRotation(objectId, obj.rotation_y + Math.PI / 2);
  }

  function deleteObjects(objectIds: string[], opts?: { recordUndo?: boolean }) {
    if (objectIds.length === 0) return;
    if (opts?.recordUndo !== false) pushBuildUndo();
    setDraggingId(null);
    setDragPosition(null);
    setDragPositions(null);
    setGroupDragOrigins(null);
    setContextMenu(null);
    clearSelection();

    const idSet = new Set(objectIds);
    const deletedRoomIds = new Set(
      objects.filter((o) => idSet.has(o.id) && o.object_type === "room").map((o) => o.id),
    );
    if (deletedRoomIds.size > 0) {
      setOfficeLinks((prev) => {
        const next = prev.filter((l) => !deletedRoomIds.has(l.to_room_id));
        if (!supabaseConfigured) persistLocalLinks(next);
        return next;
      });
      setFloorCutouts((prev) => {
        const rooms = { ...prev.rooms };
        for (const id of deletedRoomIds) delete rooms[id];
        const next = { ...prev, rooms };
        saveLocalCutouts(officeId, next);
        return next;
      });
    }

    setObjects((prev) => {
      const next = prev.filter((o) => !idSet.has(o.id));
      if (!supabaseConfigured) {
        persistLocal(next);
        const localReg = loadLocalRegistry();
        const localChambers = loadLocalChambers();
        const chambersToDelete = localChambers.filter((c) => idSet.has(c.building_object_id || ""));
        const chamberRegIds = new Set(chambersToDelete.map((c) => c.entity_registry_id));
        const newReg = localReg.filter((r) => !idSet.has(r.id) && !chamberRegIds.has(r.id));
        const newChambers = localChambers.filter((c) => !idSet.has(c.building_object_id || ""));
        saveLocalRegistry(newReg);
        saveLocalChambers(newChambers);
      }
      return next;
    });

    if (!supabaseConfigured) return;
    void Promise.all(
      objectIds.map((id) =>
        fetch(`/api/offices/${officeId}/objects/${id}`, { method: "DELETE" }),
      ),
    )
      .then(() => refreshObjects())
      .catch(() => refreshObjects());
  }

  function deleteObject(objectId: string, opts?: { recordUndo?: boolean }) {
    deleteObjects([objectId], opts);
  }

  function eraseFloorRegion(rect: SnappedRect) {
    setDeleteHoverTarget(null);
    pushBuildUndo();
    const rooms = objects.filter((o) => o.object_type === "room" && o.size_w && o.size_d);
    const classified = classifiedCellsInRect(rect, rooms);
    if (classified.length === 0) return;

    const roomsToCheck = new Set<string>();

    setFloorCutouts((prev) => {
      let next = prev;
      let baseChanged = false;

      for (const cell of classified) {
        if (cell.zone === "room" && cell.roomId) {
          next = withRoomCutout(next, cell.roomId, cell.key);
          roomsToCheck.add(cell.roomId);
        } else if (cell.zone === "inner" || cell.zone === "outer") {
          next = withBaseCutout(next, cell.zone, cell.key);
          baseChanged = true;
        }
      }

      saveLocalCutouts(officeId, next);
      if (baseChanged) {
        void persistPaint({ ...officePaint, ...cutoutsToPaintPatch(next) });
      }

      for (const roomId of roomsToCheck) {
        const room = objects.find((o) => o.id === roomId && o.object_type === "room");
        if (!room?.size_w || !room.size_d) continue;
        const bounds = roomCellBounds({
          position_x: room.position_x,
          position_z: room.position_z,
          size_w: room.size_w,
          size_d: room.size_d,
        });
        const erased = new Set(next.rooms[roomId] ?? []);
        if (countVisibleRoomCells(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, erased) === 0) {
          queueMicrotask(() => deleteObject(roomId));
        }
      }

      return next;
    });
  }

  async function updateWallGeometry(
    objectId: string,
    stroke: WallStrokePlacement,
  ) {
    if (!supabaseConfigured) {
      setObjects((prev) => {
        const next = prev.map((o) =>
          o.id === objectId
            ? {
                ...o,
                position_x: stroke.x,
                position_z: stroke.z,
                rotation_y: stroke.rotationY,
                size_w: stroke.length,
              }
            : o,
        );
        persistLocal(next);
        return next;
      });
      return;
    }

    const res = await fetch(`/api/offices/${officeId}/objects/${objectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        position_x: stroke.x,
        position_z: stroke.z,
        rotation_y: stroke.rotationY,
        size_w: stroke.length,
      }),
    });
    const data = (await res.json()) as { object?: OfficeObjectRow; error?: string };
    if (!res.ok || !data.object) throw new Error(data.error ?? "Не удалось обновить стену");
    setObjects((prev) => prev.map((o) => (o.id === objectId ? data.object! : o)));
  }

  function eraseWallSegment(wallId: string, hitX: number, hitZ: number) {
    const wall = objects.find((o) => o.id === wallId && o.object_type === "wall");
    if (!wall?.size_w) return;
    setDeleteHoverTarget(null);
    pushBuildUndo();

    const segments = wallSegmentsAfterErase(
      wall.position_x,
      wall.position_z,
      wall.rotation_y,
      wall.size_w,
      hitX,
      hitZ,
    );

    if (segments.length === 0) {
      deleteObject(wallId, { recordUndo: false });
      return;
    }

    if (segments.length === 1) {
      void updateWallGeometry(wallId, segments[0]!);
      return;
    }

    deleteObject(wallId, { recordUndo: false });
    void createWall(segments[0]!, false);
    void createWall(segments[1]!, false);
  }

  function clearEntireScene() {
    pushBuildUndo();
    const ids = visibleObjects.map((o) => o.id);
    if (ids.length > 0) deleteObjects(ids, { recordUndo: false });

    const links = [...officeLinks];
    setOfficeLinks([]);
    if (!supabaseConfigured) {
      persistLocalLinks([]);
    } else if (links.length > 0) {
      void Promise.all(
        links.map((l) =>
          fetch(`/api/offices/${officeId}/links/${l.id}`, { method: "DELETE" }),
        ),
      ).then(() => refreshLinks());
    }

    void persistPaint({
      ...officePaint,
      hiddenInnerFloor: true,
      hiddenOuterFloor: true,
    });
    setFloorCutouts(EMPTY_CUTOUTS);
    saveLocalCutouts(officeId, EMPTY_CUTOUTS);
  }

  function deleteOfficeLink(linkId: string) {
    pushBuildUndo();
    clearSelection();
    setOfficeLinks((prev) => {
      const next = prev.filter((l) => l.id !== linkId);
      if (!supabaseConfigured) persistLocalLinks(next);
      return next;
    });
    if (!supabaseConfigured) return;
    void fetch(`/api/offices/${officeId}/links/${linkId}`, { method: "DELETE" })
      .then(() => refreshLinks())
      .catch(() => refreshLinks());
  }

  async function createOfficeLink(toRoomId: string) {
    const room = objects.find((o) => o.id === toRoomId && o.object_type === "room");
    if (!room) return;
    if (officeLinks.some((l) => l.to_room_id === toRoomId)) return;
    pushBuildUndo();

    if (!supabaseConfigured) {
      const row: OfficeLinkRow = {
        id: newLocalLinkId(),
        office_id: officeId,
        to_room_id: toRoomId,
        created_at: new Date().toISOString(),
      };
      setOfficeLinks((prev) => {
        if (prev.some((l) => l.to_room_id === toRoomId)) return prev;
        const next = [...prev, row];
        persistLocalLinks(next);
        return next;
      });
      return;
    }

    const res = await fetch(`/api/offices/${officeId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_room_id: toRoomId }),
    });
    if (res.ok) void refreshLinks();
  }

  function handleRoomCablePick(roomId: string) {
    void createOfficeLink(roomId);
    cancelCableMode();
  }

  function handleSelectLink(linkId: string) {
    if (deleteMode) {
      setDeleteHoverTarget(null);
      deleteOfficeLink(linkId);
      return;
    }
    setSelectedObjectIds([]);
    setSelectedLinkId(linkId);
    setContextMenu(null);
  }

  function handleSelectConnection(connId: string) {
    if (deleteMode) {
      setDeleteHoverTarget(null);
      void deleteConnection(connId);
      return;
    }
    const found = connections.find((c) => c.id === connId) || null;
    setSelectedObjectIds([]);
    setSelectedLinkId(null);
    setSelectedConnectionId(connId);
    setEditingConnection(found);
    setContextMenu(null);
  }

  function handleSelectTargetChamber(target: ChamberRow) {
    if (!cablingSourceChamber) return;
    setEditingConnection({
      id: "new",
      source_entity_id: cablingSourceChamber.entity_registry_id,
      target_entity_id: target.entity_registry_id,
      priority: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      connection_permissions: {
        connection_id: "new",
        read_knowledge: false,
        read_rules: false,
        read_results: false,
        send_tasks: false,
      }
    });
    setSelectedConnectionId(null);
    setCablingSourceChamber(null);
  }

  function handleAddAction(action: AddMenuAction) {
    if (action.kind === "drawWall") {
      setPlacement(null);
      clearSelection();
      cancelCableMode();
      cancelEditorModes();
      setWallDrawActive(true);
      return;
    }
    if (action.kind === "drawRoom") {
      setPlacement(null);
      clearSelection();
      cancelCableMode();
      cancelEditorModes();
      setRoomDrawActive(true);
      return;
    }
    if (action.kind === "delete") {
      setPlacement(null);
      clearSelection();
      cancelCableMode();
      cancelEditorModes();
      setDeleteMode(true);
      return;
    }
    if (action.kind === "move") {
      setPlacement(null);
      cancelCableMode();
      cancelEditorModes();
      setMoveMode(true);
      return;
    }
    if (action.kind === "place") startPlacement(action.objectType);
    if (action.kind === "cable") {
      setPlacement(null);
      cancelEditorModes();
      clearSelection();
      setCableMode(true);
    }
    if (action.kind === "seedWalls") void seedDefaultWalls();
  }

  const dismissUI = useCallback(() => {
    setOfficePanelOpen(false);
    setBuildingPanelOpen(false);
    setChamberPanelOpen(false);
    setSelectedAgentId(null);
    clearSelection();
  }, []);

  function handleOpenSelectedPanel() {
    if (!selectedObject) return;
    if (selectedObject.object_type === "cabinet") {
      setPanelTab("knowledge");
      setOfficePanelOpen(true);
    } else if (selectedObject.object_type === "board") {
      setPanelTab("rules");
      setOfficePanelOpen(true);
    } else if (selectedObject.object_type === "room") {
      setBuildingPanelOpen(true);
    }
  }

  function selectAllObjects() {
    setSelectedObjectIds(visibleObjects.map((o) => o.id));
    setSelectedLinkId(null);
    setContextMenu(null);
  }

  function deleteSelectedObjects() {
    if (selectedObjectIds.length === 0) return;
    deleteObjects(selectedObjectIds);
  }

  function handleSelectObject(objectId: string, additive = false) {
    if (deleteMode) {
      if (additive) {
        setSelectedLinkId(null);
        setSelectedObjectIds((prev) =>
          prev.includes(objectId) ? prev.filter((id) => id !== objectId) : [...prev, objectId],
        );
        return;
      }
      deleteObject(objectId);
      setDeleteHoverTarget(null);
      return;
    }
    if (wallDrawActive || roomDrawActive) return;
    setSelectedLinkId(null);
    setContextMenu(null);

    if (additive) {
      setSelectedObjectIds((prev) =>
        prev.includes(objectId) ? prev.filter((id) => id !== objectId) : [...prev, objectId],
      );
      return;
    }

    setSelectedObjectIds([objectId]);
    if (moveMode) setMoveDragReady(false);
  }

  function handleMarqueeComplete(ids: string[]) {
    if (ids.length > 0) {
      setSelectedObjectIds(ids);
      setSelectedLinkId(null);
      setPaintTarget(null);
      if (moveMode) setMoveDragReady(true);
    } else {
      clearSelection();
    }
  }

  function handleMoveArm() {
    if (moveMode) setMoveDragReady(true);
  }

  function handleDragStart(objectId: string) {
    if (!moveMode) return;
    setMoveDragReady(false);
    const ids =
      selectedObjectIds.includes(objectId) && selectedObjectIds.length > 1
        ? selectedObjectIds
        : [objectId];

    if (!selectedObjectIds.includes(objectId)) {
      setSelectedObjectIds([objectId]);
    }

    const origins: Record<string, { x: number; z: number }> = {};
    for (const id of ids) {
      const o = objects.find((obj) => obj.id === id);
      if (o) origins[id] = { x: o.position_x, z: o.position_z };
    }
    setGroupDragOrigins(origins);
    setDraggingId(objectId);
    setDragPosition(null);
    setDragPositions(null);
  }

  function handleDragMove(x: number, z: number, _valid: boolean) {
    if (!draggingId || !groupDragOrigins) return;
    const anchor = groupDragOrigins[draggingId];
    if (!anchor) return;
    const dx = x - anchor.x;
    const dz = z - anchor.z;
    const next: Record<string, { x: number; z: number }> = {};
    let allValid = true;
    for (const [id, orig] of Object.entries(groupDragOrigins)) {
      const px = orig.x + dx;
      const pz = orig.z + dz;
      next[id] = { x: px, z: pz };
      const obj = objects.find((o) => o.id === id);
      if (obj && !isObjectRowInBounds(obj, px, pz)) {
        allValid = false;
      }
    }
    setDragPositions(next);
    setDragPosition({ x, z });
    setDragValid(allValid);
  }
  useEffect(() => {
    if (!placement || !isRotatableObject(placement.objectType)) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "q" && e.key !== "Q" && e.key !== "e" && e.key !== "E") return;
      e.preventDefault();
      const delta = e.key.toLowerCase() === "q" ? -Math.PI / 2 : Math.PI / 2;
      setPlacement((p) => {
        if (!p) return null;
        const rotationY = p.rotationY + delta;
        return {
          ...p,
          rotationY,
          valid: isPositionInBounds(p.x, p.z, p.objectType, rotationY),
        };
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [placement]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (viewState.mode !== "edit") {
        if (e.key === "Escape") {
          dismissUI();
        }
        return;
      }
      if ((buildModeActive || moveMode) && (e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoBuild();
        return;
      }
      if (e.key === "Escape") {
        if (buildModeActive || moveMode) {
          cancelEditorModes();
          setPlacement(null);
          cancelCableMode();
          return;
        }
        dismissUI();
        return;
      }
      if (deleteMode && (e.key === "Delete" || e.key === "Backspace") && selectedObjectIds.length > 0) {
        e.preventDefault();
        deleteSelectedObjects();
        return;
      }
      if (!deleteMode && (e.key === "Delete" || e.key === "Backspace")) {
        return;
      }
      if (selectedObjectIds.length === 0) return;
      if (e.key === "r" || e.key === "R") {
        if (selectedObjectIds.length !== 1) return;
        e.preventDefault();
        rotateObject(selectedObjectIds[0]!);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable handlers
  }, [buildModeActive, deleteMode, moveMode, selectedObjectIds, dismissUI, undoBuild, viewState.mode]);

  useEffect(() => {
    if (!draggingId) return;
    function onUp() {
      if (draggingId && dragPositions && dragValid) {
        const updates = Object.entries(dragPositions).map(([id, p]) => ({
          id,
          x: p.x,
          z: p.z,
        }));
        void updateObjectPositions(updates, { recordUndo: moveMode });
      } else if (draggingId && dragPosition && dragValid) {
        void updateObjectPosition(draggingId, dragPosition.x, dragPosition.z, moveMode);
      }
      setDraggingId(null);
      setDragPosition(null);
      setDragPositions(null);
      setGroupDragOrigins(null);
    }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [draggingId, dragPosition, dragPositions, dragValid, moveMode, updateObjectPosition, updateObjectPositions]);

  const marqueeActive =
    !placement &&
    !cableMode &&
    !wallDrawActive &&
    !roomDrawActive &&
    !paintTarget &&
    (deleteMode || moveMode || !buildModeActive);

  const agentDeskForPanel = visibleObjects.find(
    (o) => o.object_type === "desk" && o.agent_id === selectedAgentId,
  );
  const selectedColor = agentDeskForPanel?.agents
    ? getAgentVisual(agentDeskForPanel.agents).color
    : "#5c9699";

  const linkLabel = useMemo(() => {
    if (!selectedLink) return "";
    const room = visibleObjects.find((o) => o.id === selectedLink.to_room_id);
    return room ? CITY.cableCenterToBuilding : CITY.cableToBuilding;
  }, [selectedLink, visibleObjects]);

  const selectedLabel = useMemo(() => {
    if (!selectedObject) return "";
    if (selectedObject.object_type === "desk" && selectedObject.agents) {
      return selectedObject.agents.name;
    }
    if (selectedObject.object_type === "room") {
      return selectedObject.label?.trim() || OBJECT_LABELS_CITY.room;
    }
    return OBJECT_LABELS_CITY[selectedObject.object_type];
  }, [selectedObject]);

  const selectedBuilding = useMemo(() => {
    return visibleObjects.find((o) => o.id === viewState.selectedBuildingId);
  }, [visibleObjects, viewState.selectedBuildingId]);

  const headerSubtitle = useMemo(() => {
    if (viewState.mode === "use") return "ВНУТРЕННИЙ ВИД ЗДАНИЯ";
    if (viewState.mode === "edit") {
      return `РЕЖИМ РЕДАКТИРОВАНИЯ · ${viewState.editSubMode === "communications" ? "СВЯЗИ" : "ЗАСТРОЙКА"}`;
    }
    return CITY.builderTitle;
  }, [viewState]);

  const headerTitle = useMemo(() => {
    if (viewState.mode === "use" && selectedBuilding) {
      return selectedBuilding.label || "Интерьер здания";
    }
    return office?.name ?? CITY.defaultNameFull;
  }, [viewState, selectedBuilding, office]);

  const headerDescription = useMemo(() => {
    if (viewState.mode === "use") {
      return "Просмотр chambers (отделов) и назначенных агентов. Редактирование отключено.";
    }
    if (viewState.mode === "edit" && viewState.editSubMode === "communications") {
      return "Упрощенный граф связи между зданиями, отделами и агентами. Приближение камеры раскрывает детали.";
    }
    if (buildModeActive) {
      return "Застройка города · зелёный — можно · красный — нельзя · Esc — выход";
    }
    return "ЛКМ — вращение · колёсико — отдалить · клик по агенту / зданию / комоду / указу · Cmd/Ctrl+drag — рамка · «+ → Переместить» — двигать объекты";
  }, [viewState, buildModeActive]);

  return (
    <div className="relative h-screen w-full bg-app">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent-label-muted">
            {headerSubtitle}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-theme-primary md:text-2xl">
            {headerTitle}
          </h1>
          <p className={`mt-1 text-xs ${viewState.mode === 'edit' && viewState.editSubMode !== 'communications' ? 'text-teal-700 dark:text-teal-300' : 'text-theme-muted'}`}>
            {headerDescription}
          </p>
          {!supabaseConfigured && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400/80">
              Supabase не настроен — сохранение локально
            </p>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <CityViewModeToggle
            current="3d"
            className="rounded-xl border border-zinc-200 bg-white/80 px-3 py-2 text-sm font-semibold text-theme-secondary backdrop-blur-md transition hover:border-teal-500/40 hover:text-teal-700 dark:border-white/10 dark:bg-white/[0.04] dark:hover:text-teal-300"
          />
          {viewState.mode === "city" && (
            <button
              type="button"
              onClick={() => changeViewState({ mode: "edit", editSubMode: "build", selectedBuildingId: null })}
              className="rounded-xl border border-zinc-200 bg-white/80 px-3 py-2 text-sm font-semibold text-theme-secondary backdrop-blur-md transition hover:border-teal-500/40 hover:text-teal-700 dark:border-white/10 dark:bg-white/[0.04] dark:hover:text-teal-300"
            >
              Редактировать
            </button>
          )}
          {viewState.mode === "edit" && (
            <>
              <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white/80 p-1 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]">
                <button
                  type="button"
                  onClick={() => changeViewState({ mode: "edit", editSubMode: "build", selectedBuildingId: null })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    viewState.editSubMode === "build"
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-theme-secondary hover:bg-zinc-100 dark:hover:bg-white/5"
                  }`}
                >
                  Застройка
                </button>
                <button
                  type="button"
                  onClick={() => changeViewState({ mode: "edit", editSubMode: "communications", selectedBuildingId: null })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    viewState.editSubMode === "communications"
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-theme-secondary hover:bg-zinc-100 dark:hover:bg-white/5"
                  }`}
                >
                  Связи
                </button>
              </div>
              <button
                type="button"
                onClick={() => changeViewState({ mode: "city", selectedBuildingId: null })}
                className="rounded-xl border border-zinc-200 bg-white/80 px-3 py-2 text-sm font-semibold text-theme-secondary backdrop-blur-md transition hover:border-teal-500/40 hover:text-teal-700 dark:border-white/10 dark:bg-white/[0.04] dark:hover:text-teal-300"
              >
                Выйти из редактора
              </button>
            </>
          )}
          {viewState.mode === "use" && (
            <button
              type="button"
              onClick={() => changeViewState({ mode: "city", selectedBuildingId: null })}
              className="rounded-xl border border-teal-600 bg-teal-600 px-3 py-2 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-teal-700"
            >
              Выйти из здания
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setTopDownView(false);
              setOverviewRequest((n) => n + 1);
            }}
            className="rounded-xl border border-zinc-200 bg-white/80 px-3 py-2 text-sm text-theme-secondary backdrop-blur-md transition hover:border-teal-500/40 hover:text-teal-700 dark:border-white/10 dark:bg-white/[0.04] dark:hover:text-teal-300"
            title="Показать всю площадку с ландшафтом"
          >
            Обзор
          </button>
          <Link
            href="/"
            className="rounded-xl border border-zinc-200 bg-white/80 px-4 py-2 text-sm text-theme-secondary backdrop-blur-md transition hover:border-stone-400/50 hover:text-theme-primary dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:text-white"
          >
            ← Mission Control
          </Link>
        </div>
      </div>

      <MarqueeOverlay rect={marqueeRect} />
      {deleteMode && <DeleteHoverHint label={deleteHoverLabel} />}

      {viewState.mode === "use" && selectedBuilding ? (
        <UseModeCanvas
          building={selectedBuilding}
          chambers={allChambers.filter((c) => c.building_object_id === viewState.selectedBuildingId)}
          assignments={chamberAssignments}
          sceneColors={sceneColors}
          isDark={isDark}
          activeAgentIds={activeAgentIds}
        />
      ) : (
        <FloorEditorCanvas
          sceneColors={sceneColors}
          objects={visibleObjects}
          officeLinks={officeLinks}
          connections={connections}
          selectedConnectionId={selectedConnectionId}
          allChambers={allChambers}
          onSelectConnection={handleSelectConnection}
          activeAgentIds={activeAgentIds}
          placement={placement}
          draggingId={draggingId}
          dragPosition={dragPosition}
          dragPositions={dragPositions}
          selectedObjectIds={selectedObjectIds}
          selectedLinkId={selectedLinkId}
          cableMode={cableMode}
          marqueeActive={marqueeActive}
          onDismiss={dismissUI}
          onMarqueeChange={setMarqueeRect}
          onMarqueeComplete={handleMarqueeComplete}
          isDark={isDark}
          paintTarget={paintTarget}
          wallDrawActive={wallDrawActive}
          wallDrawDrawing={wallDrawDrawing}
          deleteMode={deleteMode}
          moveMode={moveMode}
          moveDragReady={moveDragReady}
          onMoveArm={handleMoveArm}
          deleteHoverTarget={deleteHoverTarget}
          onDeleteHoverTarget={setDeleteHoverTarget}
          showInnerFloor={!officePaint.hiddenInnerFloor}
          showOuterFloor={!officePaint.hiddenOuterFloor}
          floorCutouts={floorCutouts}
          onEraseRegion={eraseFloorRegion}
          onEraseWallSegment={eraseWallSegment}
          onEraseObject={(id) => deleteObject(id)}
          overviewRequest={overviewRequest}
          buildModeActive={buildModeActive}
          topDownView={topDownView}
          onWallStrokeComplete={(stroke) => void createWall(stroke)}
          onWallDrawingChange={setWallDrawDrawing}
          roomDrawActive={roomDrawActive}
          roomDrawDrawing={roomDrawDrawing}
          onRoomStrokeComplete={(rect) => void createRoom(rect)}
          onRoomDrawingChange={setRoomDrawDrawing}
          onSelectObject={handleSelectObject}
          onSelectLink={handleSelectLink}
          onRoomCablePick={handleRoomCablePick}
          onPlacementMove={(x, z, valid) => {
            setPlacement((p) => (p ? { ...p, x, z, valid } : null));
          }}
          onPlacementConfirm={(x, z) => {
            if (!placement) return;
            const valid = isPositionInBounds(
              x,
              z,
              placement.objectType,
              placement.rotationY,
            );
            if (!valid) return;
            void createObject(
              placement.objectType,
              x,
              z,
              placement.agent,
              placement.rotationY,
            )
              .then(() => setPlacement(null))
              .catch((err) => {
                console.error(err);
                setPlacement(null);
              });
          }}
          onDragStart={viewState.mode === "edit" && viewState.editSubMode === "build" ? handleDragStart : () => {}}
          onDragMove={handleDragMove}
          onContextMenu={(objectId, clientX, clientY) => {
            if (deleteMode || moveMode || wallDrawActive || roomDrawActive) return;
            setDraggingId(null);
            setDragPosition(null);
            setDragPositions(null);
            setGroupDragOrigins(null);
            handleSelectObject(objectId, false);
            setContextMenu({ objectId, x: clientX, y: clientY });
          }}
          mode={viewState.mode}
          editSubMode={viewState.editSubMode}
          chamberAssignments={chamberAssignments}
          onSelectChamber={setSelectedChamber}
          selectedChamber={selectedChamber}
          initialCameraState={cityViewCameraState.current}
          onSaveCamera={saveCityCamera}
        />
      )}

      {viewState.mode === "edit" && buildModeActive && (
        <SimsBuildBar
          wallMode={wallDrawActive}
          roomMode={roomDrawActive}
          deleteMode={deleteMode}
          cableMode={cableMode}
          placement={placement}
          topDown={topDownView}
          onToggleTopDown={() => setTopDownView((v) => !v)}
          onClearAll={() => {
            if (!window.confirm("Удалить все объекты, кабели и базовый пол?")) return;
            clearEntireScene();
          }}
          onSelectAll={selectAllObjects}
          onDeleteSelected={deleteSelectedObjects}
          selectedCount={selectedObjectIds.length}
          canUndo={undoStack.length > 0}
          undoCount={undoStack.length}
          onUndo={undoBuild}
          onDone={finishBuildSession}
        />
      )}

      {viewState.mode === "edit" && moveMode && (
        <MoveModeBar
          selectedCount={selectedObjectIds.length}
          onClearSelection={clearSelection}
          canUndo={undoStack.length > 0}
          undoCount={undoStack.length}
          onUndo={undoBuild}
          onDone={finishBuildSession}
        />
      )}

      {viewState.mode === "edit" && viewState.editSubMode === "build" && (
        <BuildMenuLauncher
          open={addMenuOpen}
          onOpenChange={setAddMenuOpen}
          onAction={handleAddAction}
          onDeskClick={() => {
            setAddMenuOpen(false);
            setDeskPickerOpen(true);
          }}
        />
      )}

      <PickAgentForDesk
        officeId={officeId}
        supabaseConfigured={supabaseConfigured}
        placedAgentIds={visibleObjects
          .filter((o) => o.object_type === "desk" && o.agent_id)
          .map((o) => o.agent_id!)}
        open={deskPickerOpen}
        onClose={() => setDeskPickerOpen(false)}
        onPick={(agent) => startPlacement("desk", agent)}
      />

      <OfficePanel
        officeId={officeId}
        office={office}
        open={officePanelOpen}
        initialTab={panelTab}
        onClose={() => setOfficePanelOpen(false)}
        onOfficeUpdated={setOffice}
      />

      <BuildingPanel
        officeId={officeId}
        buildingId={selectedObject?.id || ""}
        building={selectedObject}
        supabaseConfigured={supabaseConfigured}
        open={buildingPanelOpen && selectedObject?.object_type === "room" && viewState.mode === "city"}
        onClose={() => setBuildingPanelOpen(false)}
        onOpenChamber={(chamber) => {
          setSelectedChamber(chamber);
          setBuildingPanelOpen(false);
          setChamberPanelOpen(true);
        }}
        cablingSourceChamber={cablingSourceChamber}
        onSelectTargetChamber={handleSelectTargetChamber}
        onEnterBuilding={() => {
          if (selectedObject) {
            setBuildingPanelOpen(false);
            changeViewState({
              mode: "use",
              selectedBuildingId: selectedObject.id,
            });
          }
        }}
      />

      <ChamberPanel
        officeId={officeId}
        chamber={selectedChamber}
        supabaseConfigured={supabaseConfigured}
        open={chamberPanelOpen && viewState.mode !== "use"}
        onClose={() => setChamberPanelOpen(false)}
        onBackToBuilding={() => {
          setChamberPanelOpen(false);
          setBuildingPanelOpen(true);
        }}
        onStartCabling={() => {
          if (selectedChamber) {
            setCablingSourceChamber(selectedChamber);
            setChamberPanelOpen(false);
            setBuildingPanelOpen(true);
          }
        }}
      />

      {selectedAgentId && viewState.mode !== "use" && (
        <AgentDetailPanel
          officeId={officeId}
          agentId={selectedAgentId}
          color={selectedColor}
          open
          onClose={() => setSelectedAgentId(null)}
        />
      )}

      {viewState.mode !== "use" && selectedObject && !cableMode && !deleteMode && !moveMode && !wallDrawActive && !roomDrawActive && (
        <EditorToolbar
          label={selectedLabel}
          objectType={selectedObject.object_type}
          editableName={
            selectedObject.object_type === "room"
              ? {
                  value: roomLabelDraft,
                  placeholder: CITY.roomNamePlaceholder,
                  onChange: setRoomLabelDraft,
                  onCommit: () => {
                    if (!selectedObject) return;
                    void updateObjectLabel(selectedObject.id, roomLabelDraft);
                  },
                }
              : undefined
          }
          onRotate={() => rotateObject(selectedObject.id)}
          onInfo={
            selectedObject.object_type === "desk" && selectedObject.agent_id
              ? () => setSelectedAgentId(selectedObject.agent_id)
              : undefined
          }
          onOpen={
            selectedObject.object_type === "cabinet" || selectedObject.object_type === "board"
              ? handleOpenSelectedPanel
              : undefined
          }
          onColor={
            selectedObject.object_type === "wall" ||
            selectedObject.object_type === "door" ||
            selectedObject.object_type === "room"
              ? () =>
                  setPaintTarget(
                    selectedObject.object_type === "room"
                      ? { kind: "room", objectId: selectedObject.id }
                      : { kind: "wall", objectId: selectedObject.id },
                  )
              : undefined
          }
          onClose={clearSelection}
        />
      )}

      {paintTarget && (
        <ColorPickerPanel
          title={
            paintTarget.kind === "room" ? "Цвет участка здания" : "Цвет стены"
          }
          isDark={isDark}
          currentHex={selectedObject?.color ?? undefined}
          onPick={handlePaintPick}
          onClose={() => setPaintTarget(null)}
        />
      )}

      <BuildingCreateDialog
        open={pendingRoomCreation !== null}
        title="Создать здание"
        submitLabel="Создать"
        namePlaceholder="Название здания"
        descriptionPlaceholder="Кратко опишите, чем занимается это здание"
        initialName={pendingRoomCreation?.defaultName ?? undefined}
        creating={false}
        onCancel={() => setPendingRoomCreation(null)}
        onSubmit={({ name, routingDescription }) => {
          void confirmPendingRoomCreation(name, routingDescription);
        }}
      />

      {selectedLink && !deleteMode && (
        <ConnectionToolbar
          label={linkLabel}
          onClose={clearSelection}
        />
      )}


      {contextMenu && (
        <ObjectContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          objectType={
            visibleObjects.find((o) => o.id === contextMenu.objectId)?.object_type ?? "wall"
          }
          onClose={() => setContextMenu(null)}
          onRotate={() => rotateObject(contextMenu.objectId)}
        />
      )}

      <p className="pointer-events-none absolute bottom-4 right-5 z-10 max-w-[280px] text-right text-xs text-theme-faint">
        Клик по объекту — выделить · + — режим Sims-строительства
      </p>

      {cablingSourceChamber && (
        <div className="pointer-events-auto absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
          <div className="theme-panel-solid flex items-center gap-3 rounded-2xl px-4 py-2.5 shadow-2xl border border-teal-500/30 bg-teal-50/90 dark:bg-teal-950/20">
            <span className="text-sm font-medium text-teal-800 dark:text-teal-200">
              🔗 Соединение от <strong>{cablingSourceChamber.name}</strong>. Выберите целевой отдел в панели здания.
            </span>
            <button
              type="button"
              onClick={() => setCablingSourceChamber(null)}
              className="rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-white/10 dark:hover:bg-white/20 px-2.5 py-1 text-xs font-semibold transition"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {editingConnection && (
        <ConnectionModal
          connection={editingConnection}
          allChambers={allChambers}
          onClose={() => setEditingConnection(null)}
          onSave={handleSaveConnection}
          onDelete={
            editingConnection.id !== "new"
              ? () => {
                  void deleteConnection(editingConnection.id);
                  setEditingConnection(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

interface ConnectionModalProps {
  connection: ConnectionRow;
  allChambers: ChamberRow[];
  onClose: () => void;
  onSave: (payload: {
    priority: number;
    is_active: boolean;
    read_knowledge: boolean;
    read_rules: boolean;
    read_results: boolean;
    send_tasks: boolean;
  }) => Promise<void>;
  onDelete?: () => void;
}

function ConnectionModal({
  connection,
  allChambers,
  onClose,
  onSave,
  onDelete,
}: ConnectionModalProps) {
  const sourceChamb = allChambers.find((c) => c.entity_registry_id === connection.source_entity_id);
  const targetChamb = allChambers.find((c) => c.entity_registry_id === connection.target_entity_id);
  
  const sourceName = sourceChamb?.name || "Неизвестный источник";
  const targetName = targetChamb?.name || "Неизвестная цель";

  const isNew = connection.id === "new";

  const [priority, setPriority] = useState(connection.priority);
  const [isActive, setIsActive] = useState(connection.is_active);

  const [readKnowledge, setReadKnowledge] = useState(
    connection.connection_permissions?.read_knowledge ?? false
  );
  const [readRules, setReadRules] = useState(
    connection.connection_permissions?.read_rules ?? false
  );
  const [readResults, setReadResults] = useState(
    connection.connection_permissions?.read_results ?? false
  );
  const [sendTasks, setSendTasks] = useState(
    connection.connection_permissions?.send_tasks ?? false
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        priority,
        is_active: isActive,
        read_knowledge: readKnowledge,
        read_rules: readRules,
        read_results: readResults,
        send_tasks: sendTasks,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="theme-panel-solid w-full max-w-md rounded-2xl border border-zinc-200 shadow-2xl p-6 dark:border-white/10 dark:bg-zinc-900 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-4 mb-4 dark:border-white/10">
          <h3 className="text-lg font-semibold text-theme-primary">
            {isNew ? "Новое подключение" : "Настройка подключения"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-theme-muted hover:text-theme-secondary text-sm font-medium"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="space-y-4 text-sm text-theme-secondary">
          <div className="flex justify-between items-center bg-stone-100/50 dark:bg-white/[0.03] p-3 rounded-xl border border-zinc-100 dark:border-white/[0.05]">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-theme-muted">Откуда (Источник)</div>
              <div className="font-semibold text-teal-600 dark:text-teal-400 mt-0.5">{sourceName}</div>
            </div>
            <div className="text-zinc-400 dark:text-zinc-600 font-bold text-lg">➜</div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-theme-muted">Куда (Получатель)</div>
              <div className="font-semibold text-purple-600 dark:text-purple-400 mt-0.5">{targetName}</div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-theme-primary mb-2 uppercase tracking-wider">
              Разрешения (Permissions)
            </label>
            <div className="space-y-2 rounded-xl border border-zinc-200 dark:border-white/10 p-3 bg-white/50 dark:bg-black/20">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={readKnowledge}
                  onChange={(e) => setReadKnowledge(e.target.checked)}
                  className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
                <div>
                  <span className="font-medium text-theme-primary">Читать базу знаний</span>
                  <p className="text-[11px] text-theme-muted">Target видит знания (knowledge) источника</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer border-t border-zinc-100 dark:border-white/5 pt-2">
                <input
                  type="checkbox"
                  checked={readRules}
                  onChange={(e) => setReadRules(e.target.checked)}
                  className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
                <div>
                  <span className="font-medium text-theme-primary">Читать правила</span>
                  <p className="text-[11px] text-theme-muted">Target видит правила (rules) источника</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer border-t border-zinc-100 dark:border-white/5 pt-2">
                <input
                  type="checkbox"
                  checked={readResults}
                  onChange={(e) => setReadResults(e.target.checked)}
                  className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
                <div>
                  <span className="font-medium text-theme-primary">Читать результаты работы</span>
                  <p className="text-[11px] text-theme-muted">Target видит последний результат источника</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer border-t border-zinc-100 dark:border-white/5 pt-2">
                <input
                  type="checkbox"
                  checked={sendTasks}
                  onChange={(e) => setSendTasks(e.target.checked)}
                  className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
                <div>
                  <span className="font-medium text-theme-primary">Передавать задачи (Forward Tasks)</span>
                  <p className="text-[11px] text-theme-muted">Разрешает перенаправление задач от источника к получателю</p>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-theme-primary mb-1 uppercase tracking-wider">
                Приоритет (Priority)
              </label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-theme-secondary outline-none focus:border-teal-500 dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme-primary mb-1 uppercase tracking-wider">
                Статус
              </label>
              <div className="flex items-center h-[38px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <span className="text-sm font-medium text-theme-primary">Активен (is_active)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 pt-4 mt-6 dark:border-white/10">
          <div>
            {!isNew && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/60 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-300 transition shadow-sm"
              >
                Удалить кабель
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-theme-muted hover:text-theme-secondary dark:border-white/10"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 text-sm font-semibold transition disabled:opacity-50 shadow-sm"
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
