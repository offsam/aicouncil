import type { FlowPoint } from "./connection-route-path";
import type { HandleFlowAnchor } from "./connection-handle-flow-coords";

/** How far the cable extends outward from the jack face before the main route. */
export const CABLE_JACK_STUB_PX = 14;

export function cableExitPoint(anchor: HandleFlowAnchor, stub = CABLE_JACK_STUB_PX): FlowPoint {
  return {
    x: anchor.x + anchor.outwardX * stub,
    y: anchor.y + anchor.outwardY * stub,
  };
}

export function cableStubPath(anchor: HandleFlowAnchor, exit: FlowPoint): string {
  return `M ${anchor.x} ${anchor.y} L ${exit.x} ${exit.y}`;
}
