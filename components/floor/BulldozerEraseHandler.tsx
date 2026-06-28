"use client";

import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Object3D, Vector2 } from "three";
import { isFloorSpaceHeld } from "@/lib/floor-space-pan";
import { useFloorPlaneHit } from "@/lib/floor-stroke-pointer";
import {
  rectFromDrag,
  roomPreviewAtCursor,
  ROOM_MIN_STROKE,
  type SnappedRect,
} from "@/lib/floor-grid";
import { objectsInWorldRect } from "@/lib/marquee-select";
import type { OfficeObjectRow } from "@/lib/office-types";
import { wallErasePreviewPoint } from "@/lib/wall-segment-erase";
import type { DeleteHoverTarget } from "@/lib/delete-hover";
import { RoomFloorMesh } from "./RoomFloorMesh";

const OBJECT_ID_KEY = "bulldozerObjectId";
const ndc = new Vector2();

export function markBulldozerObject(obj: Object3D, objectId: string) {
  obj.userData[OBJECT_ID_KEY] = objectId;
}

export function findBulldozerObjectId(obj: Object3D | null | undefined): string | null {
  let current: Object3D | null | undefined = obj;
  while (current) {
    const id = current.userData[OBJECT_ID_KEY];
    if (typeof id === "string") return id;
    current = current.parent;
  }
  return null;
}

type BulldozerHit =
  | { kind: "wall"; id: string; x: number; z: number }
  | { kind: "object"; id: string }
  | { kind: "floor"; x: number; z: number };

interface BulldozerEraseActiveProps {
  objects: OfficeObjectRow[];
  isDark: boolean;
  onEraseRegion: (rect: SnappedRect) => void;
  onEraseWallSegment: (wallId: string, hitX: number, hitZ: number) => void;
  onEraseObject: (objectId: string) => void;
  onHoverTarget: (target: DeleteHoverTarget | null, wallHit?: { hitX: number; hitZ: number }) => void;
  onRegionPreview?: (rect: SnappedRect | null, objectIds: string[]) => void;
}

interface ErasePreviewState {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
}

function rectFromPreview(preview: ErasePreviewState): SnappedRect {
  const len = Math.hypot(preview.endX - preview.startX, preview.endZ - preview.startZ);
  return len >= ROOM_MIN_STROKE
    ? rectFromDrag(preview.startX, preview.startZ, preview.endX, preview.endZ)
    : roomPreviewAtCursor(preview.startX, preview.startZ);
}

function EraseRegionOverlay({
  rect,
  isDark,
}: {
  rect: SnappedRect;
  isDark: boolean;
}) {
  return (
    <group position={[rect.centerX, 0, rect.centerZ]}>
      <RoomFloorMesh
        width={rect.width}
        depth={rect.depth}
        isDark={isDark}
        preview
        invalid
        interactive={false}
      />
    </group>
  );
}

/** Bulldozer: клик по объекту — удалить · стена — участок · пол — выделить и снести при отпускании. */
export function BulldozerEraseActive({
  objects,
  isDark,
  onEraseRegion,
  onEraseWallSegment,
  onEraseObject,
  onHoverTarget,
  onRegionPreview,
}: BulldozerEraseActiveProps) {
  const { camera, raycaster, gl, scene } = useThree();
  const { hitFromClient } = useFloorPlaneHit(camera, raycaster, gl.domElement);

  const [preview, setPreview] = useState<ErasePreviewState | null>(null);
  const drawingRef = useRef(false);
  const startRef = useRef({ x: 0, z: 0 });
  const endRef = useRef({ x: 0, z: 0 });
  const objectsRef = useRef(objects);
  const onEraseRegionRef = useRef(onEraseRegion);
  const onEraseWallSegmentRef = useRef(onEraseWallSegment);
  const onEraseObjectRef = useRef(onEraseObject);
  const onHoverTargetRef = useRef(onHoverTarget);
  const onRegionPreviewRef = useRef(onRegionPreview);
  objectsRef.current = objects;
  onEraseRegionRef.current = onEraseRegion;
  onEraseWallSegmentRef.current = onEraseWallSegment;
  onEraseObjectRef.current = onEraseObject;
  onHoverTargetRef.current = onHoverTarget;
  onRegionPreviewRef.current = onRegionPreview;

  function notifyRegionPreview(rect: SnappedRect | null) {
    if (!onRegionPreviewRef.current) return;
    const ids = rect
      ? objectsInWorldRect(
          objectsRef.current
            .filter((o) => o.object_type !== "room")
            .map((o) => ({ id: o.id, position_x: o.position_x, position_z: o.position_z })),
          rect,
        )
      : [];
    onRegionPreviewRef.current(rect, ids);
  }

  function raycastTarget(clientX: number, clientY: number): BulldozerHit | null {
    const rect = gl.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(scene.children, true);

    for (const hit of hits) {
      const id = findBulldozerObjectId(hit.object);
      if (!id) continue;
      const obj = objectsRef.current.find((o) => o.id === id);
      if (!obj || obj.object_type === "room") continue;
      if (obj.object_type === "wall" && obj.size_w) {
        return { kind: "wall", id, x: hit.point.x, z: hit.point.z };
      }
      return { kind: "object", id };
    }

    const floor = hitFromClient(clientX, clientY);
    if (floor) return { kind: "floor", x: floor.x, z: floor.z };
    return null;
  }

  function finishFloorErase(start: { x: number; z: number }, end: { x: number; z: number }) {
    const len = Math.hypot(end.x - start.x, end.z - start.z);
    const rect =
      len >= ROOM_MIN_STROKE
        ? rectFromDrag(start.x, start.z, end.x, end.z)
        : roomPreviewAtCursor(start.x, start.z);
    setPreview(null);
    notifyRegionPreview(null);
    onEraseRegionRef.current(rect);
  }

  useEffect(() => {
    drawingRef.current = false;
    setPreview(null);
    notifyRegionPreview(null);
    onHoverTargetRef.current(null);

    const canvas = gl.domElement;

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0 || isFloorSpaceHeld()) return;
      if (e.target !== canvas && !canvas.contains(e.target as Node)) return;

      const target = raycastTarget(e.clientX, e.clientY);
      if (!target) return;

      if (target.kind === "wall") {
        onEraseWallSegmentRef.current(target.id, target.x, target.z);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (target.kind === "object") {
        onEraseObjectRef.current(target.id);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      drawingRef.current = true;
      startRef.current = { x: target.x, z: target.z };
      endRef.current = { x: target.x, z: target.z };
      setPreview({ startX: target.x, startZ: target.z, endX: target.x, endZ: target.z });
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    }

    function onPointerMove(e: PointerEvent) {
      if (!drawingRef.current) {
        const target = raycastTarget(e.clientX, e.clientY);
        if (!target) {
          onHoverTargetRef.current(null);
          return;
        }
        if (target.kind === "wall") {
          onHoverTargetRef.current({ kind: "wallSegment", id: target.id }, { hitX: target.x, hitZ: target.z });
        } else if (target.kind === "object") {
          onHoverTargetRef.current({ kind: "object", id: target.id });
        } else {
          onHoverTargetRef.current(null);
        }
        return;
      }

      const hit = hitFromClient(e.clientX, e.clientY);
      if (hit) endRef.current = hit;
      const next = {
        startX: startRef.current.x,
        startZ: startRef.current.z,
        endX: endRef.current.x,
        endZ: endRef.current.z,
      };
      setPreview(next);
      notifyRegionPreview(rectFromPreview(next));
    }

    function onPointerUp(e: PointerEvent) {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }

      if (!drawingRef.current) return;
      const start = { ...startRef.current };
      const end = { ...endRef.current };
      drawingRef.current = false;
      finishFloorErase(start, end);
      e.preventDefault();
      e.stopPropagation();
    }

    canvas.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      drawingRef.current = false;
      setPreview(null);
      notifyRegionPreview(null);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      onHoverTargetRef.current(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable refs
  }, [camera, gl.domElement, hitFromClient, raycaster, scene]);

  const liveRect = preview ? rectFromPreview(preview) : null;

  return <>{liveRect && <EraseRegionOverlay rect={liveRect} isDark={isDark} />}</>;
}

export { wallErasePreviewPoint };
