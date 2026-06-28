import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export type OrbitInteraction = {
  rotate: boolean;
  pan: boolean;
  zoom?: boolean;
};

/** Keep OrbitControls enabled; toggle rotate/pan while zoom stays available. */
export function applyOrbitInteraction(
  controls: OrbitControlsImpl | null | undefined,
  { rotate, pan, zoom = true }: OrbitInteraction,
) {
  if (!controls) return;
  controls.enabled = true;
  controls.enableRotate = rotate;
  controls.enablePan = pan;
  controls.enableZoom = zoom;
}
