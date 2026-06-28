import { useCallback } from "react";
import type { Camera, Raycaster, WebGLRenderer } from "three";
import { Plane, Vector2, Vector3 } from "three";

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const HIT = new Vector3();
const NDC = new Vector2();

export function useFloorPlaneHit(
  camera: Camera,
  raycaster: Raycaster,
  canvas: WebGLRenderer["domElement"],
) {
  const hitFromNdc = useCallback(
    (ndcX: number, ndcY: number) => {
      NDC.set(ndcX, ndcY);
      raycaster.setFromCamera(NDC, camera);
      const point = raycaster.ray.intersectPlane(FLOOR_PLANE, HIT);
      if (!point) return null;
      return { x: point.x, z: point.z };
    },
    [camera, raycaster],
  );

  const hitFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
      return hitFromNdc(ndcX, ndcY);
    },
    [canvas, hitFromNdc],
  );

  return { hitFromNdc, hitFromClient };
}
