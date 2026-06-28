"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, RoundedBox, Billboard, Text } from "@react-three/drei";
import type { Group, Object3D } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ACESFilmicToneMapping, MOUSE, PCFSoftShadowMap, Plane, Vector3 } from "three";
import type { PaintTarget } from "@/lib/floor-paint-storage";
import type { SceneColors } from "@/lib/use-prefers-dark";
import { isFloorSpaceHeld } from "@/lib/floor-space-pan";
import { isMarqueeModifier } from "@/lib/selection-modifiers";
import { FLOOR_CAMERA } from "@/lib/floor-scene-config";
import { WORK_FLOOR, getHubCableAnchor, getRoomCableAnchor, isPositionInBounds } from "@/lib/office-bounds";
import { getAgentVisual, getAgentColorById } from "@/lib/agent-visual";
import type { AgentRow, OfficeLinkRow, OfficeObjectRow, OfficeObjectType, ConnectionRow, ChamberRow, AgentAssignmentRow } from "@/lib/office-types";
import {
  getChamberLocalPosition,
  getChamberWorldPosition,
  getChamberWorldPosition3,
} from "@/lib/floor-chamber-position";
import { AgentDesk } from "./AgentDesk";
import { DataCable } from "./DataCable";
import { FloorObjectMesh } from "./FloorObjectMesh";
import { OfficeRoom } from "./OfficeRoom";
import { SceneLighting } from "./SceneLighting";
import { SpacePanControls } from "./SpacePanControls";
import { FloorMarqueeHandler } from "./FloorMarqueeHandler";
import type { SnappedRect } from "@/lib/floor-grid";
import { FLOOR_GRID } from "@/lib/floor-grid";
import type { ScreenRect } from "@/lib/marquee-select";
import type { WallStrokePlacement } from "@/lib/wall-draw";
import { BuildGrid } from "./BuildGrid";
import { BuildTopDownCamera } from "./BuildTopDownCamera";
import { SiteLandscape } from "./SiteLandscape";
import { RoomDrawActive } from "./RoomDrawHandler";
import { RoomFloorMesh } from "./RoomFloorMesh";
import { ChamberZoneMesh } from "./ChamberZoneMesh";
import { OrbitClickGuard } from "./OrbitClickGuard";
import { markOrbitPauseTarget } from "@/lib/floor-orbit-guard";
import { applyOrbitInteraction } from "@/lib/floor-orbit-controls";
import { BulldozerEraseActive, markBulldozerObject } from "./BulldozerEraseHandler";
import { wallErasePreviewPoint } from "@/lib/wall-segment-erase";
import { roomCutoutSet } from "@/lib/floor-cutouts-storage";
import type { FloorCutoutStore } from "@/lib/floor-cutouts-storage";
import { WallDrawActive } from "./WallDrawHandler";
import { isDeleteHoverActive, type DeleteHoverTarget } from "@/lib/delete-hover";
import { isLandscapePlantType } from "@/lib/landscape-plants";
import { isObjectPointerInteractive } from "@/lib/floor-object-interaction";
import { LandscapePlantMesh } from "./LandscapePlantMesh";
import { WorkFloorPerimeter } from "./WorkFloorPerimeter";
import { PlacementClickHandler } from "./PlacementClickHandler";

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const HIT = new Vector3();

export interface PlacementState {
  objectType: OfficeObjectType;
  agent: AgentRow | null;
  x: number;
  z: number;
  rotationY: number;
  valid: boolean;
}

interface FloorEditorCanvasProps {
  sceneColors: SceneColors;
  objects: OfficeObjectRow[];
  officeLinks: OfficeLinkRow[];
  connections?: ConnectionRow[];
  selectedConnectionId?: string | null;
  allChambers?: ChamberRow[];
  onSelectConnection?: (connId: string) => void;
  activeAgentIds: string[];
  placement: PlacementState | null;
  draggingId: string | null;
  dragPosition: { x: number; z: number } | null;
  dragPositions: Record<string, { x: number; z: number }> | null;
  selectedObjectIds: string[];
  selectedLinkId: string | null;
  cableMode: boolean;
  marqueeActive: boolean;
  onDismiss: () => void;
  onSelectObject: (objectId: string, additive: boolean) => void;
  onMarqueeChange: (rect: ScreenRect | null) => void;
  onMarqueeComplete: (objectIds: string[]) => void;
  onSelectLink: (linkId: string) => void;
  onRoomCablePick: (roomId: string) => void;
  onPlacementMove: (x: number, z: number, valid: boolean) => void;
  onPlacementConfirm: (x: number, z: number) => void;
  onDragStart: (objectId: string) => void;
  onDragMove: (x: number, z: number, valid: boolean) => void;
  onContextMenu: (objectId: string, clientX: number, clientY: number) => void;
  isDark: boolean;
  paintTarget: PaintTarget | null;
  wallDrawActive: boolean;
  wallDrawDrawing: boolean;
  deleteMode: boolean;
  moveMode?: boolean;
  moveDragReady?: boolean;
  onMoveArm?: () => void;
  deleteHoverTarget?: DeleteHoverTarget | null;
  onDeleteHoverTarget?: (target: DeleteHoverTarget | null) => void;
  onWallStrokeComplete: (stroke: WallStrokePlacement) => void;
  onWallDrawingChange: (drawing: boolean) => void;
  buildModeActive: boolean;
  topDownView: boolean;
  roomDrawActive: boolean;
  roomDrawDrawing: boolean;
  onRoomStrokeComplete: (rect: SnappedRect) => void;
  onRoomDrawingChange: (drawing: boolean) => void;
  showInnerFloor?: boolean;
  showOuterFloor?: boolean;
  floorCutouts: FloorCutoutStore;
  onEraseRegion: (rect: SnappedRect) => void;
  onEraseWallSegment: (wallId: string, hitX: number, hitZ: number) => void;
  onEraseObject: (objectId: string) => void;
  overviewRequest?: number;
  mode?: "city" | "use" | "edit";
  editSubMode?: "build" | "communications";
  chamberAssignments?: Record<string, AgentAssignmentRow[]>;
  onSelectChamber?: (chamber: ChamberRow | null) => void;
  selectedChamber?: ChamberRow | null;
  initialCameraState?: { position: [number, number, number]; target: [number, number, number] } | null;
  onSaveCamera?: (position: [number, number, number], target: [number, number, number]) => void;
}

function OverviewCamera({
  token,
  controlsRef,
}: {
  token: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (!token) return;
    const controls = controlsRef.current;
    const cz = WORK_FLOOR.centerZ;
    const d = FLOOR_CAMERA.maxDistance * 0.78;
    camera.position.set(d * 0.62, d * 0.52, d * 0.62);
    if (controls) {
      controls.target.set(0, 0, cz);
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI / 2.2;
      controls.update();
    }
  }, [token, camera, controlsRef]);

  return null;
}

type InteractionMode = "normal" | "wallDraw" | "delete" | "move";

const MOVE_SLOP_PX = 4;

function objectBoundsSize(obj: OfficeObjectRow) {
  if (obj.object_type === "room" && obj.size_w && obj.size_d) {
    return { w: obj.size_w, d: obj.size_d };
  }
  if (obj.object_type === "wall") {
    return { w: obj.size_w ?? 2, d: 0.12 };
  }
  return undefined;
}

function checkObjectInBounds(
  x: number,
  z: number,
  obj: OfficeObjectRow,
): boolean {
  return isPositionInBounds(
    x,
    z,
    obj.object_type,
    obj.rotation_y,
    objectBoundsSize(obj),
  );
}

function DraggableObjectGroup({
  children,
  position,
  rotationY,
  onDragStart,
  onContextMenu,
  onClick,
  onOrbitPause,
  onDeleteHover,
  onDeleteHoverEnd,
  onMovePick,
  interactionMode = "normal",
  allowWholeDelete = true,
  placementActive = false,
  objectId,
  moveSelected = false,
  onMoveArm,
  pointerInteractive = true,
}: {
  children: React.ReactNode;
  position: [number, number, number];
  rotationY: number;
  onDragStart: () => void;
  onContextMenu: (clientX: number, clientY: number) => void;
  onClick: (additive: boolean) => void;
  onOrbitPause: (enabled: boolean) => void;
  onDeleteHover?: () => void;
  onDeleteHoverEnd?: () => void;
  moveSelected?: boolean;
  onMoveArm?: () => void;
  onMovePick?: (additive: boolean) => void;
  interactionMode?: InteractionMode;
  allowWholeDelete?: boolean;
  placementActive?: boolean;
  objectId?: string;
  pointerInteractive?: boolean;
}) {
  const longPressRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const dragStartedRef = useRef(false);
  const pointerOrigin = useRef({ x: 0, y: 0 });

  const groupRef = useRef<Group>(null);

  useEffect(() => {
    if (!groupRef.current || !pointerInteractive) return;
    markOrbitPauseTarget(groupRef.current);
    if (objectId) markBulldozerObject(groupRef.current, objectId);
  }, [objectId, pointerInteractive]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || pointerInteractive) return;

    const saved = new Map<Object3D, Object3D["raycast"]>();
    group.traverse((obj) => {
      saved.set(obj, obj.raycast);
      obj.raycast = () => null;
    });

    return () => {
      for (const [obj, fn] of saved) obj.raycast = fn;
    };
  }, [pointerInteractive, children]);

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, rotationY, 0]}
      raycast={pointerInteractive ? undefined : () => null}
      onPointerDown={
        pointerInteractive
          ? (e) => {
        if (placementActive) return;
        if (e.button !== 0 || isFloorSpaceHeld()) return;
        if (interactionMode === "wallDraw") return;
        if (isMarqueeModifier(e.nativeEvent)) return;
        e.stopPropagation();
        onOrbitPause(false);
        if (interactionMode === "delete") {
          if (!allowWholeDelete) return;
          onClick(e.nativeEvent.shiftKey);
          const onUp = () => {
            onOrbitPause(true);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointerup", onUp);
          return;
        }
        if (interactionMode === "move") {
          onMovePick?.(e.nativeEvent.shiftKey);
          if (!moveSelected) {
            const onUp = () => {
              onOrbitPause(true);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointerup", onUp);
            return;
          }
        } else {
          longPressRef.current = window.setTimeout(() => {
            onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY);
          }, 550);
          const onUp = () => {
            if (longPressRef.current) {
              window.clearTimeout(longPressRef.current);
              longPressRef.current = null;
            }
            onOrbitPause(true);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointerup", onUp);
          return;
        }
        dragStartedRef.current = false;
        movedRef.current = false;
        pointerOrigin.current = { x: e.clientX, y: e.clientY };
        const dragSlop = MOVE_SLOP_PX;

        const onMove = (ev: PointerEvent) => {
          const dx = ev.clientX - pointerOrigin.current.x;
          const dy = ev.clientY - pointerOrigin.current.y;
          if (Math.hypot(dx, dy) > dragSlop) {
            movedRef.current = true;
            if (longPressRef.current) {
              window.clearTimeout(longPressRef.current);
              longPressRef.current = null;
            }
            if (!dragStartedRef.current) {
              dragStartedRef.current = true;
              onDragStart();
            }
          }
        };

        const onUp = () => {
          if (longPressRef.current) {
            window.clearTimeout(longPressRef.current);
            longPressRef.current = null;
          }
          if (interactionMode === "move" && !dragStartedRef.current) {
            onMoveArm?.();
          }
          onOrbitPause(true);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }
          : undefined
      }
      onPointerOver={
        pointerInteractive
          ? (e) => {
        if (interactionMode !== "delete") return;
        e.stopPropagation();
        onDeleteHover?.();
      }
          : undefined
      }
      onPointerOut={
        pointerInteractive
          ? () => {
        if (interactionMode !== "delete") return;
        onDeleteHoverEnd?.();
      }
          : undefined
      }
      onClick={
        pointerInteractive
          ? (e) => {
        if (interactionMode === "delete" || interactionMode === "move") return;
        if (isFloorSpaceHeld() || isMarqueeModifier(e.nativeEvent)) return;
        e.stopPropagation();
        onClick(e.nativeEvent.shiftKey);
      }
          : undefined
      }
      onContextMenu={
        pointerInteractive
          ? (e) => {
        e.nativeEvent.preventDefault();
        e.stopPropagation();
        if (longPressRef.current) {
          window.clearTimeout(longPressRef.current);
          longPressRef.current = null;
        }
        onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY);
      }
          : undefined
      }
    >
      {children}
    </group>
  );
}

function RaycastLoop({
  active,
  objectType,
  rotationY = 0,
  onHit,
}: {
  active: boolean;
  objectType: OfficeObjectType;
  rotationY?: number;
  onHit: (x: number, z: number, valid: boolean) => void;
}) {
  const { camera, raycaster, pointer } = useThree();

  useFrame(() => {
    if (!active) return;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.ray.intersectPlane(FLOOR_PLANE, HIT);
    if (!hit) return;
    onHit(hit.x, hit.z, isPositionInBounds(hit.x, hit.z, objectType, rotationY));
  });

  return null;
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

function SceneInner(props: FloorEditorCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomLevelRef = useRef(1);

  const {
    sceneColors,
    objects,
    officeLinks,
    connections = [],
    selectedConnectionId = null,
    allChambers = [],
    onSelectConnection,
    activeAgentIds,
    placement,
    draggingId,
    dragPosition,
    dragPositions,
    selectedObjectIds,
    selectedLinkId,
    cableMode,
    marqueeActive,
    onSelectObject,
    onMarqueeChange,
    onMarqueeComplete,
    onSelectLink,
    onRoomCablePick,
    onPlacementMove,
    onPlacementConfirm,
    onDragStart,
    onDragMove,
    onContextMenu,
    isDark,
    wallDrawActive,
    wallDrawDrawing,
    deleteMode,
    moveMode = false,
    moveDragReady = false,
    onMoveArm,
    deleteHoverTarget = null,
    onDeleteHoverTarget,
    onWallStrokeComplete,
    onWallDrawingChange,
    buildModeActive,
    topDownView,
    roomDrawActive,
    roomDrawDrawing,
    onRoomStrokeComplete,
    onRoomDrawingChange,
    showInnerFloor = true,
    showOuterFloor = true,
    floorCutouts,
    onEraseRegion,
    onEraseWallSegment,
    onEraseObject,
    overviewRequest = 0,
    mode = "city",
    editSubMode = "build",
    chamberAssignments = {},
    onSelectChamber,
    selectedChamber = null,
  } = props;

  const isCommMode = mode === "edit" && editSubMode === "communications";

  useFrame(({ camera }) => {
    if (!controlsRef.current) return;
    const dist = camera.position.distanceTo(controlsRef.current.target);
    let newLvl = 1;
    if (dist < 40) {
      newLvl = 3;
    } else if (dist < 90) {
      newLvl = 2;
    }
    if (newLvl !== zoomLevelRef.current) {
      zoomLevelRef.current = newLvl;
      setZoomLevel(newLvl);
    }
  });

  const { gl, camera } = useThree();
  const onSaveCameraRef = useRef(props.onSaveCamera);
  onSaveCameraRef.current = props.onSaveCamera;

  // Restore saved city camera once when canvas mounts (after exiting Use Mode).
  useEffect(() => {
    const saved = props.initialCameraState;
    if (!saved || !controlsRef.current) return;
    camera.position.set(saved.position[0], saved.position[1], saved.position[2]);
    controlsRef.current.target.set(saved.target[0], saved.target[1], saved.target[2]);
    controlsRef.current.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run once on mount only
  }, []);

  // Persist city camera only when leaving this canvas (entering Use Mode).
  useEffect(() => {
    return () => {
      if (!onSaveCameraRef.current || !controlsRef.current) return;
      const pos = camera.position;
      const tar = controlsRef.current.target;
      onSaveCameraRef.current([pos.x, pos.y, pos.z], [tar.x, tar.y, tar.z]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: unmount-only save
  }, []);
  const [bulldozerHoverWall, setBulldozerHoverWall] = useState<{
    id: string;
    hitX: number;
    hitZ: number;
  } | null>(null);
  const [bulldozerRegionIds, setBulldozerRegionIds] = useState<string[]>([]);

  const drawModeActive = wallDrawActive || roomDrawActive;

  const sceneInteractionFlags = useMemo(
    () => ({
      deleteMode,
      moveMode,
      cableMode,
      placement: Boolean(placement),
      wallDrawActive,
      roomDrawActive,
    }),
    [deleteMode, moveMode, cableMode, placement, wallDrawActive, roomDrawActive],
  );

  const objectPointerInteractive = useCallback(
    (type: OfficeObjectType) => isObjectPointerInteractive(type, sceneInteractionFlags),
    [sceneInteractionFlags],
  );

  const interactionMode: InteractionMode = deleteMode
    ? "delete"
    : moveMode
      ? "move"
      : drawModeActive
        ? "wallDraw"
        : "normal";

  const hubAnchor = useMemo(() => getHubCableAnchor(), []);

  const roomById = useMemo(() => {
    const map = new Map<string, OfficeObjectRow>();
    for (const o of objects) {
      if (o.object_type === "room") map.set(o.id, o);
    }
    return map;
  }, [objects]);

  const linkedRoomIds = useMemo(
    () => new Set(officeLinks.map((l) => l.to_room_id)),
    [officeLinks],
  );

  const orbitInteractBlocked = Boolean(
    placement || draggingId || wallDrawDrawing || roomDrawDrawing || buildModeActive,
  );

  const setOrbitEnabled = useCallback(
    (enabled: boolean) => {
      applyOrbitInteraction(controlsRef.current, {
        rotate: enabled && !orbitInteractBlocked,
        pan: enabled && !orbitInteractBlocked,
      });
    },
    [orbitInteractBlocked],
  );

  const selectableObjects = useMemo(
    () =>
      objects
        .filter((o) => o.object_type !== "room" || (o.size_w && o.size_d))
        .map((o) => ({ id: o.id, position_x: o.position_x, position_z: o.position_z })),
    [objects],
  );

  function objectPos(obj: OfficeObjectRow) {
    const dragged = dragPositions?.[obj.id];
    if (dragged) return dragged;
    if (draggingId === obj.id && dragPosition) return dragPosition;
    return { x: obj.position_x, z: obj.position_z };
  }

  function isSelected(id: string) {
    return selectedObjectIds.includes(id);
  }

  useEffect(() => {
    const canvas = gl.domElement;
    if (deleteMode || drawModeActive || cableMode) {
      canvas.style.cursor = "crosshair";
    } else if (moveMode) {
      canvas.style.cursor = "grab";
    } else if (placement) {
      canvas.style.cursor = "pointer";
    } else {
      canvas.style.cursor = "";
    }
    return () => {
      canvas.style.cursor = "";
    };
  }, [deleteMode, drawModeActive, cableMode, moveMode, placement, gl.domElement]);

  useEffect(() => {
    applyOrbitInteraction(controlsRef.current, {
      rotate: !orbitInteractBlocked,
      pan: !orbitInteractBlocked,
    });
  }, [orbitInteractBlocked]);

  const handlePlacementHit = useCallback(
    (x: number, z: number, valid: boolean) => {
      onPlacementMove(x, z, valid);
    },
    [onPlacementMove],
  );

  const handleDragHit = useCallback(
    (x: number, z: number) => {
      if (!draggingId) return;
      const obj = objects.find((o) => o.id === draggingId);
      if (!obj) return;
      onDragMove(x, z, isPositionInBounds(x, z, obj.object_type, obj.rotation_y));
    },
    [draggingId, objects, onDragMove],
  );

  const dragObject = objects.find((o) => o.id === draggingId);
  const dragObjectType = dragObject?.object_type ?? "desk";

  function hoverObject(id: string) {
    onDeleteHoverTarget?.({ kind: "object", id });
  }

  function clearHover() {
    onDeleteHoverTarget?.(null);
  }

  function isObjectHovered(id: string) {
    return (
      isDeleteHoverActive(deleteHoverTarget, { kind: "object", id }) ||
      bulldozerRegionIds.includes(id)
    );
  }

  function isLinkHovered(id: string) {
    return isDeleteHoverActive(deleteHoverTarget, { kind: "link", id });
  }

  const erodedInner = useMemo(
    () => new Set(floorCutouts.baseInner),
    [floorCutouts.baseInner],
  );
  const erodedOuter = useMemo(
    () => new Set(floorCutouts.baseOuter),
    [floorCutouts.baseOuter],
  );

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[...FLOOR_CAMERA.defaultPosition]}
        fov={FLOOR_CAMERA.fov}
      />
      <OrbitControls
        ref={controlsRef}
        enabled
        enableRotate={!orbitInteractBlocked}
        enablePan={!orbitInteractBlocked}
        enableZoom
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.45}
        panSpeed={0.55}
        zoomSpeed={0.85}
        minDistance={FLOOR_CAMERA.minDistance}
        maxDistance={FLOOR_CAMERA.maxDistance}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, WORK_FLOOR.centerZ]}
        mouseButtons={{
          LEFT: MOUSE.ROTATE,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.PAN,
        }}
      />
      {!isCommMode && (
        <>
          <SpacePanControls controlsRef={controlsRef} enabled={!placement && !draggingId && !wallDrawDrawing && !roomDrawDrawing} />

          <OrbitClickGuard
            controlsRef={controlsRef}
            enabled={!orbitInteractBlocked}
            skipInteraction={buildModeActive}
          />

          {marqueeActive && (
            <FloorMarqueeHandler
              active
              controlsRef={controlsRef}
              orbitInteractBlocked={orbitInteractBlocked}
              selectableObjects={selectableObjects}
              onMarqueeChange={onMarqueeChange}
              onMarqueeComplete={onMarqueeComplete}
              requireModifier={!moveMode}
              keepRectOnComplete={moveMode}
            />
          )}

          <SceneLighting />

          <SiteLandscape isDark={isDark} />

          <BuildGrid active={buildModeActive && !placement} isDark={isDark} />
          <BuildTopDownCamera active={topDownView} controlsRef={controlsRef} />
          <OverviewCamera token={overviewRequest} controlsRef={controlsRef} />

          <OfficeRoom
            colors={sceneColors}
            showInnerFloor={showInnerFloor}
            showOuterFloor={showOuterFloor}
            deleteMode={deleteMode}
            erodedInner={erodedInner}
            erodedOuter={erodedOuter}
          />

          {deleteMode && (
            <BulldozerEraseActive
              objects={objects}
              isDark={isDark}
              onEraseRegion={onEraseRegion}
              onEraseWallSegment={onEraseWallSegment}
              onEraseObject={onEraseObject}
              onRegionPreview={(_rect, ids) => setBulldozerRegionIds(ids)}
              onHoverTarget={(target, wallHit) => {
                if (target?.kind === "wallSegment" && wallHit) {
                  setBulldozerHoverWall({ id: target.id, hitX: wallHit.hitX, hitZ: wallHit.hitZ });
                  onDeleteHoverTarget?.(target);
                  return;
                }
                setBulldozerHoverWall(null);
                onDeleteHoverTarget?.(target);
              }}
            />
          )}

          <WorkFloorPerimeter isDark={isDark} emphasized={buildModeActive} />

          {objects
            .filter((o) => o.object_type === "room" && o.size_w && o.size_d)
            .map((room) => {
              const pos = objectPos(room);
              const isDragging = Boolean(draggingId && dragPositions?.[room.id]);
              const valid =
                isDragging && draggingId === room.id && dragPosition
                  ? checkObjectInBounds(dragPosition.x, dragPosition.z, room)
                  : true;

              const roomErased = roomCutoutSet(floorCutouts, room.id);

              const roomMesh = (
                <RoomFloorMesh
                  width={room.size_w!}
                  depth={room.size_d!}
                  worldCenterX={pos.x}
                  worldCenterZ={pos.z}
                  color={room.color}
                  label={room.label}
                  labelColor={sceneColors.label}
                  textOutline={sceneColors.textOutline}
                  isDark={isDark}
                  selected={isSelected(room.id) || (cableMode && !linkedRoomIds.has(room.id))}
                  deleteMode={deleteMode}
                  erasedCells={roomErased}
                  invalid={isDragging && !valid}
                  interactive={!deleteMode && !placement}
                />
              );

              if (deleteMode) {
                return (
                  <group key={room.id} position={[pos.x, 0, pos.z]}>
                    {roomMesh}
                  </group>
                );
              }

              return (
                <DraggableObjectGroup
                  key={room.id}
                  position={[pos.x, 0, pos.z]}
                  rotationY={0}
                  interactionMode={interactionMode}
                  placementActive={Boolean(placement)}
                  objectId={room.id}
                  pointerInteractive={objectPointerInteractive("room")}
                  onDragStart={() => onDragStart(room.id)}
                  onContextMenu={(cx, cy) => onContextMenu(room.id, cx, cy)}
                  onOrbitPause={setOrbitEnabled}
                  onMovePick={(additive) => {
                    if (cableMode) return;
                    onSelectObject(room.id, additive);
                  }}
                  onClick={(additive) => {
                    if (cableMode) {
                      onRoomCablePick(room.id);
                      return;
                    }
                    if (drawModeActive) return;
                    onSelectObject(room.id, additive);
                  }}
                  onDeleteHover={() => hoverObject(room.id)}
                  onDeleteHoverEnd={clearHover}
                  moveSelected={moveMode && moveDragReady && isSelected(room.id)}
                  onMoveArm={onMoveArm}
                >
                  {roomMesh}
                </DraggableObjectGroup>
              );
            })}

          {wallDrawActive && (
            <WallDrawActive
              onStrokeComplete={onWallStrokeComplete}
              onDrawingChange={onWallDrawingChange}
            />
          )}

          {roomDrawActive && (
            <RoomDrawActive
              isDark={isDark}
              onStrokeComplete={onRoomStrokeComplete}
              onDrawingChange={onRoomDrawingChange}
            />
          )}

          {officeLinks.map((link) => {
            const room = roomById.get(link.to_room_id);
            if (!room) return null;
            const active = selectedLinkId === link.id;
            return (
              <group
                key={link.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLink(link.id);
                }}
                onPointerOver={(e) => {
                  if (!deleteMode) return;
                  e.stopPropagation();
                  onDeleteHoverTarget?.({ kind: "link", id: link.id });
                }}
                onPointerOut={() => {
                  if (!deleteMode) return;
                  clearHover();
                }}
              >
                <DataCable
                  from={hubAnchor}
                  to={getRoomCableAnchor(room)}
                  active={active || (deleteMode && isLinkHovered(link.id))}
                  activeColor={deleteMode && isLinkHovered(link.id) ? "#ef4444" : sceneColors.cableActive}
                  variant="office"
                />
              </group>
            );
          })}

          {allChambers.map((chamb) => {
            const building = objects.find((o) => o.id === chamb.building_object_id);
            if (!building) return null;
            const buildingPos = objectPos(building);
            const local = getChamberLocalPosition(chamb);
            return (
              <group key={`chamber-zone-${chamb.id}`} position={[buildingPos.x, 0, buildingPos.z]}>
                <ChamberZoneMesh
                  x={local.x}
                  z={local.z}
                  width={Number(chamb.width)}
                  depth={Number(chamb.depth)}
                  name={chamb.name}
                  labelColor={sceneColors.label}
                  textOutline={sceneColors.textOutline}
                />
              </group>
            );
          })}

          {connections.map((conn) => {
            const sourceChamb = allChambers.find((c) => c.entity_registry_id === conn.source_entity_id);
            const targetChamb = allChambers.find((c) => c.entity_registry_id === conn.target_entity_id);
            if (!sourceChamb || !targetChamb) return null;

            const sourceBuilding = objects.find((o) => o.id === sourceChamb.building_object_id);
            const targetBuilding = objects.find((o) => o.id === targetChamb.building_object_id);
            if (!sourceBuilding || !targetBuilding) return null;

            const sourceBuildingPos = objectPos(sourceBuilding);
            const targetBuildingPos = objectPos(targetBuilding);

            const fromPos = getChamberWorldPosition3(
              sourceBuilding,
              sourceChamb,
              0.06,
              sourceBuildingPos,
            );
            const toPos = getChamberWorldPosition3(
              targetBuilding,
              targetChamb,
              0.06,
              targetBuildingPos,
            );

            const active = selectedConnectionId === conn.id;
            const isHovered = deleteMode && deleteHoverTarget?.kind === "connection" && deleteHoverTarget.id === conn.id;

            let cableColor = "#8b5cf6"; // default purple
            const perms = conn.connection_permissions;
            if (!conn.is_active) {
              cableColor = "#71717a"; // grey
            } else if (perms) {
              if (perms.send_tasks) {
                cableColor = "#a855f7"; // neon purple
              } else if (perms.read_knowledge) {
                cableColor = "#06b6d4"; // cyan
              } else if (perms.read_rules) {
                cableColor = "#10b981"; // green
              }
            }

            if (isHovered) {
              cableColor = "#ef4444"; // red for hover delete
            }

            return (
              <group
                key={conn.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectConnection?.(conn.id);
                }}
                onPointerOver={(e) => {
                  if (!deleteMode) return;
                  e.stopPropagation();
                  onDeleteHoverTarget?.({ kind: "connection", id: conn.id });
                }}
                onPointerOut={() => {
                  if (!deleteMode) return;
                  clearHover();
                }}
              >
                <DataCable
                  from={fromPos}
                  to={toPos}
                  active={active || isHovered}
                  activeColor={cableColor}
                  variant="workflow"
                />
              </group>
            );
          })}

          {objects.map((obj) => {
            if (obj.object_type === "room") return null;
            const pos = objectPos(obj);
            const isDragging = Boolean(draggingId && dragPositions?.[obj.id]);
            const x = pos.x;
            const z = pos.z;
            const valid =
              isDragging && draggingId === obj.id && dragPosition
                ? checkObjectInBounds(dragPosition.x, dragPosition.z, obj)
                : true;

            if (obj.object_type === "desk" && obj.agents) {
              const visual = getAgentVisual(obj.agents);
              const isWorking =
                obj.agent_id != null && activeAgentIds.includes(obj.agent_id);
              return (
                <group
                  key={obj.id}
                  position={[x, 0, z]}
                  rotation={[0, obj.rotation_y, 0]}
                >
                  <AgentDesk
                    name={visual.name}
                    color={visual.color}
                    online={visual.status === "online"}
                    position={[0, 0, 0]}
                    objectId={obj.id}
                    isEditorSelected={isSelected(obj.id)}
                    invalid={isDragging && !valid}
                    preview={false}
                    working={isWorking}
                    blockPlacement={Boolean(placement)}
                    onSelect={(additive) => {
                      if (drawModeActive || cableMode) return;
                      onSelectObject(obj.id, additive);
                    }}
                    onDragStart={
                      moveMode && !deleteMode && !cableMode && !drawModeActive
                        ? () => onDragStart(obj.id)
                        : undefined
                    }
                    moveMode={moveMode}
                    moveDragEnabled={moveMode && moveDragReady && isSelected(obj.id)}
                    onMoveArm={onMoveArm}
                    onOrbitPause={setOrbitEnabled}
                    deleteMode={deleteMode}
                    deleteHover={isObjectHovered(obj.id)}
                    onDeleteHover={() => hoverObject(obj.id)}
                    onDeleteHoverEnd={clearHover}
                    onContextMenu={(e) => {
                      onContextMenu(obj.id, e.nativeEvent.clientX, e.nativeEvent.clientY);
                    }}
                    textOutline={sceneColors.textOutline}
                  />
                </group>
              );
            }

            if (isLandscapePlantType(obj.object_type)) {
              return (
                <DraggableObjectGroup
                  key={obj.id}
                  position={[x, 0, z]}
                  rotationY={obj.rotation_y}
                  interactionMode={interactionMode}
                  placementActive={Boolean(placement)}
                  objectId={obj.id}
                  pointerInteractive={objectPointerInteractive(obj.object_type)}
                  onDragStart={() => onDragStart(obj.id)}
                  onContextMenu={(cx, cy) => onContextMenu(obj.id, cx, cy)}
                  onOrbitPause={setOrbitEnabled}
                  onClick={(additive) => {
                    if (drawModeActive || cableMode) return;
                    onSelectObject(obj.id, additive);
                  }}
                  onMovePick={(additive) => {
                    if (drawModeActive || cableMode) return;
                    onSelectObject(obj.id, additive);
                  }}
                  onDeleteHover={() => hoverObject(obj.id)}
                  onDeleteHoverEnd={clearHover}
                  moveSelected={moveMode && moveDragReady && isSelected(obj.id)}
                  onMoveArm={onMoveArm}
                >
                  <LandscapePlantMesh
                    type={obj.object_type}
                    isDark={isDark}
                    invalid={isDragging && !valid}
                    selected={isSelected(obj.id)}
                    deleteHover={isObjectHovered(obj.id)}
                    scale={obj.size_w}
                  />
                </DraggableObjectGroup>
              );
            }

        return (
          <DraggableObjectGroup
            key={obj.id}
            position={[x, 0, z]}
            rotationY={obj.rotation_y}
            interactionMode={interactionMode}
            placementActive={Boolean(placement)}
            allowWholeDelete={obj.object_type !== "wall"}
            objectId={obj.id}
            pointerInteractive={objectPointerInteractive(obj.object_type)}
            onDragStart={() => onDragStart(obj.id)}
            onContextMenu={(cx, cy) => onContextMenu(obj.id, cx, cy)}
            onOrbitPause={setOrbitEnabled}
            onClick={(additive) => {
              if (drawModeActive || cableMode) return;
              onSelectObject(obj.id, additive);
            }}
            onMovePick={(additive) => {
              if (drawModeActive || cableMode) return;
              onSelectObject(obj.id, additive);
            }}
            onDeleteHover={() => hoverObject(obj.id)}
            onDeleteHoverEnd={clearHover}
            moveSelected={moveMode && moveDragReady && isSelected(obj.id)}
            onMoveArm={onMoveArm}
          >
            <FloorObjectMesh
              type={obj.object_type}
              color={obj.color}
              length={obj.object_type === "wall" ? obj.size_w : undefined}
              invalid={isDragging && !valid}
              selected={isSelected(obj.id)}
              deleteHover={isObjectHovered(obj.id)}
              selectionColor={sceneColors.selection}
              isDark={isDark}
            />
          </DraggableObjectGroup>
        );
      })}

      {deleteMode && bulldozerHoverWall && (() => {
        const wall = objects.find(
          (o) => o.id === bulldozerHoverWall.id && o.object_type === "wall" && o.size_w,
        );
        if (!wall || !wall.size_w) return null;
        const pt = wallErasePreviewPoint(
          wall.position_x,
          wall.position_z,
          wall.rotation_y,
          wall.size_w,
          bulldozerHoverWall.hitX,
          bulldozerHoverWall.hitZ,
        );
        return (
          <group position={[pt.x, 0, pt.z]} rotation={[0, wall.rotation_y, 0]}>
            <RoundedBox args={[FLOOR_GRID, 0.65, 0.14]} radius={0.02} smoothness={2} position={[0, 0.32, 0]}>
              <meshStandardMaterial color="#fca5a5" emissive="#ef4444" emissiveIntensity={0.35} />
            </RoundedBox>
          </group>
        );
      })()}

      {placement && (
        <group
          position={[placement.x, 0, placement.z]}
          rotation={[0, placement.rotationY, 0]}
          raycast={() => null}
        >
          {placement.objectType === "desk" && placement.agent ? (
            <AgentDesk
              name={placement.agent.name}
              color={getAgentVisual(placement.agent).color}
              online={getAgentVisual(placement.agent).status === "online"}
              position={[0, 0, 0]}
              invalid={!placement.valid}
              preview
              onSelect={() => {}}
              textOutline={sceneColors.textOutline}
            />
          ) : isLandscapePlantType(placement.objectType) ? (
            <LandscapePlantMesh
              type={placement.objectType}
              isDark={isDark}
              invalid={!placement.valid}
              preview
            />
          ) : (
            <FloorObjectMesh
              type={placement.objectType}
              invalid={!placement.valid}
              preview
            />
          )}
        </group>
      )}

      {placement && (
        <PlacementClickHandler
          active
          objectType={placement.objectType}
          rotationY={placement.rotationY}
          onMove={handlePlacementHit}
          onConfirm={onPlacementConfirm}
        />
      )}

      {placement && (
        <RaycastLoop
          active
          objectType={placement.objectType}
          rotationY={placement.rotationY}
          onHit={handlePlacementHit}
        />
      )}

      {draggingId && moveMode && (
        <RaycastLoop
          active
          objectType={dragObjectType}
          rotationY={dragObject?.rotation_y ?? 0}
          onHit={handleDragHit}
        />
      )}
    </>
      )}

      {isCommMode && (
        <>
          <gridHelper args={[400, 80, "#1e293b", "#0f172a"]} position={[0, -0.01, 0]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[20, 40, 20]} intensity={0.5} />

          {/* ZOOM LEVEL 1: Building nodes + chamber-accurate connection edges (city zoom) */}
          {zoomLevel === 1 && (
            <>
              {objects
                .filter((o) => o.object_type === "room")
                .map((room) => {
                  const pos = objectPos(room);
                  const isSelectedRoom = isSelected(room.id);
                  return (
                    <group
                      key={`building-node-${room.id}`}
                      position={[pos.x, 0.5, pos.z]}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectObject(room.id, false);
                      }}
                    >
                      <mesh castShadow receiveShadow>
                        <sphereGeometry args={[0.75, 32, 32]} />
                        <meshStandardMaterial
                          color={isSelectedRoom ? "#38bdf8" : "#475569"}
                          emissive={isSelectedRoom ? "#0284c7" : "#0f172a"}
                          emissiveIntensity={0.5}
                          roughness={0.2}
                          metalness={0.8}
                        />
                      </mesh>
                      <Billboard position={[0, 1.3, 0]}>
                        <Text
                          fontSize={0.5}
                          color={sceneColors.label}
                          outlineWidth={0.03}
                          outlineColor={sceneColors.textOutline}
                          anchorX="center"
                          anchorY="middle"
                        >
                          {room.label || "Building"}
                        </Text>
                      </Billboard>
                    </group>
                  );
                })}

              {connections?.map((conn) => {
                const sourceChamb = allChambers.find((c) => c.entity_registry_id === conn.source_entity_id);
                const targetChamb = allChambers.find((c) => c.entity_registry_id === conn.target_entity_id);
                if (!sourceChamb || !targetChamb) return null;

                const sourceBuilding = objects.find((o) => o.id === sourceChamb.building_object_id);
                const targetBuilding = objects.find((o) => o.id === targetChamb.building_object_id);
                if (!sourceBuilding || !targetBuilding) return null;

                const sourcePos = objectPos(sourceBuilding);
                const targetPos = objectPos(targetBuilding);

                const fromPos = getChamberWorldPosition3(
                  sourceBuilding,
                  sourceChamb,
                  0.5,
                  sourcePos,
                );
                const toPos = getChamberWorldPosition3(
                  targetBuilding,
                  targetChamb,
                  0.5,
                  targetPos,
                );

                const active = selectedConnectionId === conn.id;

                let cableColor = "#8b5cf6";
                const perms = conn.connection_permissions;
                if (!conn.is_active) {
                  cableColor = "#4b5563";
                } else if (perms) {
                  if (perms.send_tasks) cableColor = "#a855f7";
                  else if (perms.read_knowledge) cableColor = "#06b6d4";
                  else if (perms.read_rules) cableColor = "#10b981";
                }

                return (
                  <group
                    key={`conn-l1-${conn.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectConnection?.(conn.id);
                    }}
                  >
                    <DataCable
                      from={fromPos}
                      to={toPos}
                      active={active}
                      activeColor={cableColor}
                      variant="workflow"
                    />
                  </group>
                );
              })}
            </>
          )}

          {/* ZOOM LEVEL 2: Wireframe Buildings & Chamber spheres & chamber-to-chamber links */}
          {zoomLevel === 2 && (
            <>
              {objects
                .filter((o) => o.object_type === "room" && o.size_w && o.size_d)
                .map((room) => {
                  const pos = objectPos(room);
                  return (
                    <mesh key={`room-wf-${room.id}`} position={[pos.x, 0.01, pos.z]}>
                      <boxGeometry args={[room.size_w!, 0.05, room.size_d!]} />
                      <meshBasicMaterial color="#334155" wireframe />
                    </mesh>
                  );
                })}

              {allChambers.map((chamb) => {
                const building = objects.find((o) => o.id === chamb.building_object_id);
                if (!building) return null;
                const bPos = objectPos(building);
                const isSelectedChamb = selectedChamber?.id === chamb.id;
                const chamberWorld = getChamberWorldPosition(building, chamb, bPos);

                return (
                  <group
                    key={`chamb-node-${chamb.id}`}
                    position={[chamberWorld.x, 0.4, chamberWorld.z]}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectChamber?.(chamb);
                    }}
                  >
                    <mesh castShadow receiveShadow>
                      <sphereGeometry args={[0.5, 32, 32]} />
                      <meshStandardMaterial
                        color={isSelectedChamb ? "#a78bfa" : "#6366f1"}
                        emissive={isSelectedChamb ? "#8b5cf6" : "#1e1b4b"}
                        emissiveIntensity={0.4}
                        roughness={0.2}
                        metalness={0.7}
                      />
                    </mesh>
                    <Billboard position={[0, 0.9, 0]}>
                      <Text
                        fontSize={0.38}
                        color={sceneColors.label}
                        outlineWidth={0.02}
                        outlineColor={sceneColors.textOutline}
                        anchorX="center"
                        anchorY="middle"
                      >
                        {chamb.name}
                      </Text>
                    </Billboard>
                  </group>
                );
              })}

              {connections?.map((conn) => {
                const sourceChamb = allChambers.find((c) => c.entity_registry_id === conn.source_entity_id);
                const targetChamb = allChambers.find((c) => c.entity_registry_id === conn.target_entity_id);
                if (!sourceChamb || !targetChamb) return null;

                const sourceBuilding = objects.find((o) => o.id === sourceChamb.building_object_id);
                const targetBuilding = objects.find((o) => o.id === targetChamb.building_object_id);
                if (!sourceBuilding || !targetBuilding) return null;

                const sBPos = objectPos(sourceBuilding);
                const tBPos = objectPos(targetBuilding);

                const fromPos = getChamberWorldPosition3(sourceBuilding, sourceChamb, 0.4, sBPos);
                const toPos = getChamberWorldPosition3(targetBuilding, targetChamb, 0.4, tBPos);

                const active = selectedConnectionId === conn.id;

                let cableColor = "#8b5cf6";
                const perms = conn.connection_permissions;
                if (!conn.is_active) {
                  cableColor = "#4b5563";
                } else if (perms) {
                  if (perms.send_tasks) cableColor = "#a855f7";
                  else if (perms.read_knowledge) cableColor = "#06b6d4";
                  else if (perms.read_rules) cableColor = "#10b981";
                }

                return (
                  <group
                    key={`conn-l2-${conn.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectConnection?.(conn.id);
                    }}
                  >
                    <DataCable
                      from={fromPos}
                      to={toPos}
                      active={active}
                      activeColor={cableColor}
                      variant="workflow"
                    />
                  </group>
                );
              })}
            </>
          )}

          {/* ZOOM LEVEL 3: Buildings, Chambers, Connections, AND Agents */}
          {zoomLevel === 3 && (
            <>
              {objects
                .filter((o) => o.object_type === "room" && o.size_w && o.size_d)
                .map((room) => {
                  const pos = objectPos(room);
                  return (
                    <mesh key={`room-wf-${room.id}`} position={[pos.x, 0.01, pos.z]}>
                      <boxGeometry args={[room.size_w!, 0.05, room.size_d!]} />
                      <meshBasicMaterial color="#1e293b" wireframe />
                    </mesh>
                  );
                })}

              {allChambers.map((chamb) => {
                const building = objects.find((o) => o.id === chamb.building_object_id);
                if (!building) return null;
                const bPos = objectPos(building);
                const isSelectedChamb = selectedChamber?.id === chamb.id;
                const chamberWorld = getChamberWorldPosition(building, chamb, bPos);
                const chamberGlobalPos = {
                  x: chamberWorld.x,
                  y: 0.4,
                  z: chamberWorld.z,
                };

                const chamberAssigns = chamberAssignments[chamb.id] || [];
                const uniqueAgents = Array.from(
                  new Map(
                    chamberAssigns
                      .map((a) => a.agents || (a.agent_id ? { id: a.agent_id, name: `Agent ${a.agent_id.substring(0, 5)}` } : null))
                      .filter(Boolean)
                      .map((agent) => [agent!.id, agent!])
                  ).values()
                );

                const offsets = getAgentOffsets(uniqueAgents.length, Number(chamb.width), Number(chamb.depth));

                return (
                  <group key={`chamb-agents-group-${chamb.id}`}>
                    <group
                      position={[chamberGlobalPos.x, chamberGlobalPos.y, chamberGlobalPos.z]}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectChamber?.(chamb);
                      }}
                    >
                      <mesh castShadow receiveShadow>
                        <sphereGeometry args={[0.45, 32, 32]} />
                        <meshStandardMaterial
                          color={isSelectedChamb ? "#a78bfa" : "#4f46e5"}
                          emissive={isSelectedChamb ? "#8b5cf6" : "#0f172a"}
                          emissiveIntensity={0.3}
                          roughness={0.25}
                          metalness={0.6}
                        />
                      </mesh>
                      <Billboard position={[0, 0.8, 0]}>
                        <Text
                          fontSize={0.32}
                          color={sceneColors.label}
                          outlineWidth={0.02}
                          outlineColor={sceneColors.textOutline}
                          anchorX="center"
                          anchorY="middle"
                        >
                          {chamb.name}
                        </Text>
                      </Billboard>
                    </group>

                    {uniqueAgents.map((agent, index) => {
                      const offset = offsets[index] || { x: 0, z: 0 };
                      const agentGlobalX = chamberGlobalPos.x + offset.x;
                      const agentGlobalZ = chamberGlobalPos.z + offset.z;
                      const isWorking = activeAgentIds.includes(agent.id);

                      return (
                        <group key={`agent-node-${agent.id}`}>
                          {/* Cable linking agent to chamber center */}
                          <DataCable
                            from={[chamberGlobalPos.x, 0.4, chamberGlobalPos.z]}
                            to={[agentGlobalX, 0.3, agentGlobalZ]}
                            active={false}
                            activeColor="#475569"
                            variant="workflow"
                          />

                          {/* Agent Sphere */}
                          <group position={[agentGlobalX, 0.3, agentGlobalZ]}>
                            <mesh castShadow receiveShadow>
                              <sphereGeometry args={[0.22, 16, 16]} />
                              <meshStandardMaterial
                                color={isWorking ? "#10b981" : "#f59e0b"}
                                emissive={isWorking ? "#059669" : "#d97706"}
                                emissiveIntensity={0.4}
                                roughness={0.3}
                                metalness={0.5}
                              />
                            </mesh>
                            <Billboard position={[0, 0.45, 0]}>
                              <Text
                                fontSize={0.2}
                                color={sceneColors.label}
                                outlineWidth={0.01}
                                outlineColor={sceneColors.textOutline}
                                anchorX="center"
                                anchorY="middle"
                              >
                                {agent.name}
                              </Text>
                            </Billboard>
                          </group>
                        </group>
                      );
                    })}
                  </group>
                );
              })}

              {connections?.map((conn) => {
                const sourceChamb = allChambers.find((c) => c.entity_registry_id === conn.source_entity_id);
                const targetChamb = allChambers.find((c) => c.entity_registry_id === conn.target_entity_id);
                if (!sourceChamb || !targetChamb) return null;

                const sourceBuilding = objects.find((o) => o.id === sourceChamb.building_object_id);
                const targetBuilding = objects.find((o) => o.id === targetChamb.building_object_id);
                if (!sourceBuilding || !targetBuilding) return null;

                const sBPos = objectPos(sourceBuilding);
                const tBPos = objectPos(targetBuilding);

                const fromPos = getChamberWorldPosition3(sourceBuilding, sourceChamb, 0.4, sBPos);
                const toPos = getChamberWorldPosition3(targetBuilding, targetChamb, 0.4, tBPos);

                const active = selectedConnectionId === conn.id;

                let cableColor = "#8b5cf6";
                const perms = conn.connection_permissions;
                if (!conn.is_active) {
                  cableColor = "#4b5563";
                } else if (perms) {
                  if (perms.send_tasks) cableColor = "#a855f7";
                  else if (perms.read_knowledge) cableColor = "#06b6d4";
                  else if (perms.read_rules) cableColor = "#10b981";
                }

                return (
                  <group
                    key={`conn-l3-${conn.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectConnection?.(conn.id);
                    }}
                  >
                    <DataCable
                      from={fromPos}
                      to={toPos}
                      active={active}
                      activeColor={cableColor}
                      variant="workflow"
                    />
                  </group>
                );
              })}
            </>
          )}
        </>
      )}
    </>
  );
}

export function FloorEditorCanvas(props: FloorEditorCanvasProps) {
  const { sceneColors, isDark, mode, editSubMode } = props;
  const isCommMode = mode === "edit" && editSubMode === "communications";
  const bgColor = isCommMode ? "#090d16" : (isDark ? "#141210" : "#c8ddd0");

  return (
    <Canvas
      shadows={{ type: PCFSoftShadowMap }}
      className="h-full w-full"
      gl={{
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.18,
        logarithmicDepthBuffer: true,
      }}
      onPointerMissed={() => {
        if (
          props.placement ||
          props.draggingId ||
          props.paintTarget ||
          props.buildModeActive
        ) {
          return;
        }
        props.onDismiss();
      }}
    >
      <color attach="background" args={[bgColor]} />
      <Suspense fallback={null}>
        <SceneInner {...props} />
      </Suspense>
    </Canvas>
  );
}
