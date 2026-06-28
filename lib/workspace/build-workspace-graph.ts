import type { Node } from "@xyflow/react";
import type { AgentAssignmentRow, ChamberRow, OfficeObjectRow } from "@/lib/office-types";
import type { TechDepartmentStats } from "@/lib/tech-department-stats";
import { AGENT_NODE_DIAMETER_PX, agentDiameterPx, defaultAgentLocalPosition } from "./agent-layout";
import { resolveAgentAccentIndex, resolveBuildingAccentIndex, resolveChamberAccentIndex } from "./building-accent";
import { isCityHallBuilding } from "./city-hall-building";
import { isTechDepartmentBuilding } from "./tech-department";
import { normalizeVisibleTechCounters } from "./tech-department-counters";
import { workspaceAssignmentNodeId } from "./agent-nodes";
import { normalizeCostTier } from "@/lib/cost-tier";
import { DEFAULT_CHAMBER } from "@/lib/control-defaults";
import {
  type WorkspaceMeta,
} from "./constants";
import { buildingAccentCssVars } from "./building-accent";
import { resolveAgentIconForDisplay, type AgentIconId } from "@/lib/agent-icon-ids";
import { agentToFlowPosition, buildingToFlowNode, chamberToFlowPosition } from "./coords";
import { WORKSPACE_NODE_DRAG_HANDLE } from "./constants";
import { normalizeNodeDimensions } from "./sync-node-dimensions";

import type { ConnectionHandleSlot } from "@/lib/workspace/connection-handle-slots";

export type CityHallNodeData = {
  label: string;
  subtitle: string;
  highlighted?: boolean;
  routeStep?: number;
  dimmed?: boolean;
  routeFading?: boolean;
};

export type BuildingNodeData = {
  label: string;
  buildingId: string;
  officeId: string;
  isCityHall?: boolean;
  accentIndex?: number;
  highlighted?: boolean;
  selected?: boolean;
  startEditing?: boolean;
  routeStep?: number;
  dimmed?: boolean;
  routeFading?: boolean;
  connectPickable?: boolean;
  connectSelected?: boolean;
  hovered?: boolean;
  connectionHandles?: ConnectionHandleSlot[];
  tronPulse?: boolean;
  agentWorking?: boolean;
  signalPhase?: "outbound" | "processing" | "return";
  signalTone?: "active" | "success";
  signalLit?: boolean;
  techDeptVisibleCounters?: string[];
  /** Client-side inventory snapshot (event-driven, no polling). */
  techDeptSnapshot?: TechDepartmentStats;
  techDeptInventoryFingerprint?: string;
  techDeptPulseAt?: number;
  chamberCount?: number;
  agentCount?: number;
};

export type WorkflowStepBadgeData = {
  current: number;
  total: number;
};

export type ChamberNodeData = {
  label: string;
  routingDescription?: string | null;
  chamberId: string;
  buildingId: string;
  entityRegistryId: string;
  officeId: string;
  accentIndex?: number;
  highlighted?: boolean;
  startEditing?: boolean;
  routeStep?: number;
  workflowStepBadge?: WorkflowStepBadgeData;
  dimmed?: boolean;
  routeFading?: boolean;
  connectPickable?: boolean;
  connectSelected?: boolean;
  hovered?: boolean;
  connectionHandles?: ConnectionHandleSlot[];
  tronPulse?: boolean;
  agentWorking?: boolean;
  signalPhase?: "outbound" | "processing" | "return";
  signalTone?: "active" | "success";
  signalLit?: boolean;
  /** Set when chamber has its own palette color (not inherited from building). */
  chamberColorId?: string;
  agentCount?: number;
  isMainChamber?: boolean;
};

export type AgentNodeData = {
  label: string;
  assignmentId: string;
  agentId: string;
  chamberDbId: string;
  officeId: string;
  provider: string;
  modelId: string;
  costTier: string;
  status?: string | null;
  layoutSizePx?: number;
  /** Chamber lead (chambers.manager_agent_id) */
  isChamberLead?: boolean;
  highlighted?: boolean;
  routeStep?: number;
  dimmed?: boolean;
  routeFading?: boolean;
  connectPickable?: boolean;
  connectSelected?: boolean;
  hovered?: boolean;
  connectionHandles?: ConnectionHandleSlot[];
  tronPulse?: boolean;
  agentWorking?: boolean;
  signalPhase?: "outbound" | "processing" | "return";
  signalTone?: "active" | "success";
  signalLit?: boolean;
  accentIndex?: number;
  /** Set when agent has its own palette color. */
  agentIconId?: AgentIconId | null;
  /** True when agent cost tier is at or below the city-wide execution mode ceiling. */
  executionTierEligible?: boolean;
};

export function parseWorkspaceMeta(raw: unknown): WorkspaceMeta {
  if (!raw || typeof raw !== "object") return {};
  return raw as WorkspaceMeta;
}

/** Build a single agent node inside an existing chamber (canvas-local dimensions). */
export function buildAgentAssignmentNode(params: {
  assignment: AgentAssignmentRow;
  chamberRegistryId: string;
  chamberDbId: string;
  officeId: string;
  chamberWidthPx: number;
  chamberHeightPx: number;
  managerAgentId?: string | null;
  agentIndex: number;
  highlightedIds?: Set<string>;
}): Node | null {
  const agent = params.assignment.agents;
  if (!agent) return null;

  const accentIndex = resolveAgentAccentIndex(null, agent.id);
  const agentIconId = resolveAgentIconForDisplay({
    color: agent.color,
    provider: agent.provider,
    modelId: agent.model_id,
  });

  const hasLayout =
    params.assignment.layout_x != null &&
    params.assignment.layout_y != null &&
    Number.isFinite(params.assignment.layout_x) &&
    Number.isFinite(params.assignment.layout_y);
  const local = hasLayout
    ? { x: params.assignment.layout_x!, y: params.assignment.layout_y! }
    : defaultAgentLocalPosition(params.agentIndex);

  const diameter = agentDiameterPx(params.assignment.layout_size ?? null);
  const agentLayout = agentToFlowPosition(
    local.x,
    local.y,
    diameter,
    params.chamberWidthPx,
    params.chamberHeightPx,
  );

  const nodeId = workspaceAssignmentNodeId(params.assignment.id);
  const highlightedIds = params.highlightedIds ?? new Set<string>();

  return normalizeNodeDimensions({
    id: nodeId,
    type: "agent",
    parentId: params.chamberRegistryId,
    extent: "parent",
    position: { x: agentLayout.x, y: agentLayout.y },
    width: agentLayout.width,
    height: agentLayout.height,
    measured: { width: agentLayout.width, height: agentLayout.height },
    data: {
      label: agent.name,
      assignmentId: params.assignment.id,
      agentId: params.assignment.agent_id,
      chamberDbId: params.chamberDbId,
      officeId: params.officeId,
      provider: agent.provider,
      modelId: agent.model_id,
      costTier: normalizeCostTier(agent.cost_tier),
      status: agent.status ?? null,
      layoutSizePx: diameter,
      isChamberLead: Boolean(
        params.managerAgentId && params.assignment.agent_id === params.managerAgentId,
      ),
      accentIndex,
      highlighted: highlightedIds.has(nodeId),
      agentIconId,
    } satisfies AgentNodeData,
    style: {
      width: agentLayout.width,
      height: agentLayout.height,
      ...buildingAccentCssVars(accentIndex),
    },
    draggable: true,
    selectable: true,
  });
}

export function buildWorkspaceNodes(
  officeId: string,
  cityName: string,
  workspaceMeta: WorkspaceMeta,
  buildings: OfficeObjectRow[],
  chambers: ChamberRow[],
  assignments: AgentAssignmentRow[] = [],
  highlightedIds: Set<string> = new Set(),
): Node[] {
  const nodes: Node[] = [];

  const chambersByBuilding = new Map<string, ChamberRow[]>();
  for (const c of chambers) {
    const bid = c.building_object_id || c.building_entity_id;
    if (!bid) continue;
    const list = chambersByBuilding.get(bid) ?? [];
    list.push(c);
    chambersByBuilding.set(bid, list);
  }

  const assignmentsByChamber = new Map<string, AgentAssignmentRow[]>();
  for (const a of assignments) {
    const list = assignmentsByChamber.get(a.chamber_id) ?? [];
    list.push(a);
    assignmentsByChamber.set(a.chamber_id, list);
  }

  const chamberLayoutByRegistryId = new Map<
    string,
    { width: number; height: number; chamberDbId: string }
  >();

  for (const b of buildings) {
    if (b.object_type !== "room") continue;
    const cityHall = isCityHallBuilding(b);
    const techDept = isTechDepartmentBuilding(b.label, b.building_role);
    const sizeW = b.size_w ?? (cityHall ? 12 : 8);
    const sizeD = b.size_d ?? (cityHall ? 10 : 6);
    const layout = buildingToFlowNode(b.position_x, b.position_z, sizeW, sizeD);
    const accentIndex = resolveBuildingAccentIndex(b.color, b.id, cityHall);
    const cityHallHighlightId = cityHall ? b.id : null;
    const buildingChambers = chambersByBuilding.get(b.id) ?? [];
    let buildingAgentCount = 0;
    for (const c of buildingChambers) {
      buildingAgentCount += (assignmentsByChamber.get(c.id) ?? []).length;
    }

    nodes.push(
      normalizeNodeDimensions({
        id: b.id,
        type: "building",
        position: { x: layout.x, y: layout.y },
        width: layout.width,
        height: layout.height,
        measured: { width: layout.width, height: layout.height },
        data: {
        label: b.label || (cityHall ? "City Hall" : `Building ${b.id.slice(0, 8)}`),
        buildingId: b.id,
        officeId,
        isCityHall: cityHall,
        accentIndex,
        chamberCount: buildingChambers.length,
        agentCount: buildingAgentCount,
        highlighted: highlightedIds.has(b.id) || (cityHallHighlightId != null && highlightedIds.has("city-hall")),
        ...(techDept
          ? {
              techDeptVisibleCounters: normalizeVisibleTechCounters(
                workspaceMeta.tech_department_visible_counters,
              ),
            }
          : {}),
      } satisfies BuildingNodeData,
      style: {
        width: layout.width,
        height: layout.height,
        ...buildingAccentCssVars(accentIndex),
      },
      draggable: true,
      selectable: true,
      dragHandle: WORKSPACE_NODE_DRAG_HANDLE,
      }),
    );

    for (const c of buildingChambers) {
      const cw = Number(c.width) || DEFAULT_CHAMBER.width;
      const cd = Number(c.depth) || DEFAULT_CHAMBER.depth;
      const cx = Number(c.x) || 0;
      const cz = Number(c.z) || 0;
      const chamberLayout = chamberToFlowPosition(
        cx,
        cz,
        cw,
        cd,
        layout.width,
        layout.height,
      );

      const registryId = c.entity_registry_id || c.id;
      chamberLayoutByRegistryId.set(registryId, {
        width: chamberLayout.width,
        height: chamberLayout.height,
        chamberDbId: c.id,
      });

      const chamberAccentIndex = resolveChamberAccentIndex(
        c.color,
        b.color,
        b.id,
        cityHall,
      );

      nodes.push(
        normalizeNodeDimensions({
          id: registryId,
          type: "chamber",
          parentId: b.id,
          extent: "parent",
          position: { x: chamberLayout.x, y: chamberLayout.y },
          width: chamberLayout.width,
          height: chamberLayout.height,
          measured: { width: chamberLayout.width, height: chamberLayout.height },
          data: {
          label: c.name,
          routingDescription: c.entity_registry?.routing_description ?? null,
          chamberId: c.id,
          buildingId: b.id,
          entityRegistryId: registryId,
          officeId,
          accentIndex: chamberAccentIndex,
          agentCount: (assignmentsByChamber.get(c.id) ?? []).length,
          isMainChamber: c.routing_role === "main",
          highlighted: highlightedIds.has(registryId),
          ...(c.color ? { chamberColorId: c.color } : {}),
        } satisfies ChamberNodeData,
        style: {
          width: chamberLayout.width,
          height: chamberLayout.height,
          ...buildingAccentCssVars(chamberAccentIndex),
        },
        draggable: true,
        selectable: true,
        dragHandle: WORKSPACE_NODE_DRAG_HANDLE,
        }),
      );
    }
  }

  for (const c of chambers) {
    const registryId = c.entity_registry_id || c.id;
    const chamberLayout = chamberLayoutByRegistryId.get(registryId);
    if (!chamberLayout) continue;

    const chamberAssignments = assignmentsByChamber.get(c.id) ?? [];
    const managerAgentId = c.manager_agent_id;
    chamberAssignments.forEach((assignment, index) => {
      const agentNode = buildAgentAssignmentNode({
        assignment,
        chamberRegistryId: registryId,
        chamberDbId: c.id,
        officeId,
        chamberWidthPx: chamberLayout.width,
        chamberHeightPx: chamberLayout.height,
        managerAgentId,
        agentIndex: index,
        highlightedIds,
      });
      if (agentNode) nodes.push(agentNode);
    });
  }

  return nodes;
}
