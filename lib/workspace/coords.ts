import { BUILDING_CHAMBER_INSET_UNITS } from "./chamber-layout";
import { WORKSPACE_UNIT_PX } from "./constants";

type NodeSizeSource = {
  style?: { width?: number | string; height?: number | string } | null;
  measured?: { width?: number; height?: number } | null;
  width?: number;
  height?: number;
};

type BuildingSizeLookupNode = NodeSizeSource & { id?: string; type?: string };

/** Resolve building frame size for chamber-local coordinate conversion. */
export function parentBuildingSizePx(
  buildingId: string,
  nodes: BuildingSizeLookupNode[],
  rfGetNode?: (id: string) => BuildingSizeLookupNode | null | undefined,
  fallbackW = 192,
  fallbackH = 144,
): { width: number; height: number } {
  const fromNodes = nodes.find((n) => n.id === buildingId && n.type === "building");
  if (fromNodes) return nodeSizePx(fromNodes, fallbackW, fallbackH);
  const fromRf = rfGetNode?.(buildingId);
  if (fromRf) return nodeSizePx(fromRf, fallbackW, fallbackH);
  return { width: fallbackW, height: fallbackH };
}

/** Prefer explicit style / width over stale DOM `measured` (source of truth for layout). */
export function nodeSizePx(
  node: NodeSizeSource | null | undefined,
  fallbackW: number,
  fallbackH: number,
): { width: number; height: number } {
  if (!node) return { width: fallbackW, height: fallbackH };

  const styleW =
    typeof node.style?.width === "number"
      ? node.style.width
      : Number.parseFloat(String(node.style?.width ?? ""));
  const styleH =
    typeof node.style?.height === "number"
      ? node.style.height
      : Number.parseFloat(String(node.style?.height ?? ""));

  const width =
    (typeof node.width === "number" && node.width > 0 ? node.width : undefined) ??
    (Number.isFinite(styleW) && styleW > 0 ? styleW : undefined) ??
    (typeof node.measured?.width === "number" && node.measured.width > 0
      ? node.measured.width
      : fallbackW);

  const height =
    (typeof node.height === "number" && node.height > 0 ? node.height : undefined) ??
    (Number.isFinite(styleH) && styleH > 0 ? styleH : undefined) ??
    (typeof node.measured?.height === "number" && node.measured.height > 0
      ? node.measured.height
      : fallbackH);

  return {
    width: Number.isFinite(width) && width > 0 ? width : fallbackW,
    height: Number.isFinite(height) && height > 0 ? height : fallbackH,
  };
}

/** Building center in world units → React Flow top-left + size in px. */
export function buildingToFlowNode(
  centerX: number,
  centerZ: number,
  sizeW: number,
  sizeD: number,
): { x: number; y: number; width: number; height: number } {
  const width = sizeW * WORKSPACE_UNIT_PX;
  const height = sizeD * WORKSPACE_UNIT_PX;
  return {
    x: centerX * WORKSPACE_UNIT_PX - width / 2,
    y: centerZ * WORKSPACE_UNIT_PX - height / 2,
    width,
    height,
  };
}

/** React Flow top-left + size → building center in world units. */
export function flowNodeToBuildingCenter(
  x: number,
  y: number,
  width: number,
  height: number,
): { position_x: number; position_z: number } {
  return {
    position_x: (x + width / 2) / WORKSPACE_UNIT_PX,
    position_z: (y + height / 2) / WORKSPACE_UNIT_PX,
  };
}

/** Agent offset from chamber center (local units) → position inside parent chamber (px). */
export function agentToFlowPosition(
  layoutX: number,
  layoutY: number,
  agentDiameterPx: number,
  parentWidthPx: number,
  parentHeightPx: number,
): { x: number; y: number; width: number; height: number } {
  const centerX = parentWidthPx / 2 + layoutX * WORKSPACE_UNIT_PX;
  const centerY = parentHeightPx / 2 + layoutY * WORKSPACE_UNIT_PX;
  return {
    x: centerX - agentDiameterPx / 2,
    y: centerY - agentDiameterPx / 2,
    width: agentDiameterPx,
    height: agentDiameterPx,
  };
}

/** Agent flow position (px, chamber-relative) → chamber-local units. */
export function flowToAgentLocal(
  flowX: number,
  flowY: number,
  agentDiameterPx: number,
  parentWidthPx: number,
  parentHeightPx: number,
): { layout_x: number; layout_y: number } {
  const centerX = flowX + agentDiameterPx / 2;
  const centerY = flowY + agentDiameterPx / 2;
  return {
    layout_x: (centerX - parentWidthPx / 2) / WORKSPACE_UNIT_PX,
    layout_y: (centerY - parentHeightPx / 2) / WORKSPACE_UNIT_PX,
  };
}

/**
 * Chamber offset from building center (world units) → position inside parent node (px).
 */
export function chamberToFlowPosition(
  chamberX: number,
  chamberZ: number,
  chamberW: number,
  chamberD: number,
  parentWidthPx: number,
  parentHeightPx: number,
): { x: number; y: number; width: number; height: number } {
  const width = chamberW * WORKSPACE_UNIT_PX;
  const height = chamberD * WORKSPACE_UNIT_PX;
  const centerX = parentWidthPx / 2 + chamberX * WORKSPACE_UNIT_PX;
  const centerY = parentHeightPx / 2 + chamberZ * WORKSPACE_UNIT_PX;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

/**
 * Chamber flow position (px, parent-relative) → building-local world units.
 */
export function flowToChamberLocal(
  flowX: number,
  flowY: number,
  widthPx: number,
  heightPx: number,
  parentWidthPx: number,
  parentHeightPx: number,
): { x: number; z: number; width: number; depth: number } {
  const centerX = flowX + widthPx / 2;
  const centerY = flowY + heightPx / 2;
  return {
    x: (centerX - parentWidthPx / 2) / WORKSPACE_UNIT_PX,
    z: (centerY - parentHeightPx / 2) / WORKSPACE_UNIT_PX,
    width: widthPx / WORKSPACE_UNIT_PX,
    depth: heightPx / WORKSPACE_UNIT_PX,
  };
}

/** Keep chamber boxes inside the building frame without overlapping the neon border. */
export function clampChamberFlowGeometry(
  flowX: number,
  flowY: number,
  widthPx: number,
  heightPx: number,
  parentWidthPx: number,
  parentHeightPx: number,
  insetUnits = BUILDING_CHAMBER_INSET_UNITS,
): { flowX: number; flowY: number; widthPx: number; heightPx: number } {
  const insetPx = insetUnits * WORKSPACE_UNIT_PX;
  const maxW = Math.max(WORKSPACE_UNIT_PX, parentWidthPx - insetPx * 2);
  const maxH = Math.max(WORKSPACE_UNIT_PX, parentHeightPx - insetPx * 2);
  const width = Math.min(widthPx, maxW);
  const height = Math.min(heightPx, maxH);
  const minX = insetPx;
  const minY = insetPx;
  const maxX = Math.max(minX, parentWidthPx - insetPx - width);
  const maxY = Math.max(minY, parentHeightPx - insetPx - height);
  return {
    flowX: Math.min(Math.max(flowX, minX), maxX),
    flowY: Math.min(Math.max(flowY, minY), maxY),
    widthPx: width,
    heightPx: height,
  };
}

/** Keep agent circles inside chamber bounds (parent-relative px). */
export function clampAgentFlowGeometry(
  flowX: number,
  flowY: number,
  diameterPx: number,
  parentWidthPx: number,
  parentHeightPx: number,
  insetUnits = 0.35,
): { flowX: number; flowY: number } {
  const insetPx = insetUnits * WORKSPACE_UNIT_PX;
  const minX = insetPx;
  const minY = insetPx;
  const maxX = Math.max(minX, parentWidthPx - insetPx - diameterPx);
  const maxY = Math.max(minY, parentHeightPx - insetPx - diameterPx);
  return {
    flowX: Math.min(Math.max(flowX, minX), maxX),
    flowY: Math.min(Math.max(flowY, minY), maxY),
  };
}
