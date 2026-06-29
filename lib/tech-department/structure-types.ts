export type CreateStructureActionType =
  | "create_building"
  | "create_chamber"
  | "create_connection"
  | "assign_agent";

export type DestructiveStructureActionType =
  | "delete_building"
  | "delete_chamber"
  | "delete_connection"
  | "unassign_agent";

export type StructureActionType = CreateStructureActionType | DestructiveStructureActionType;

export type StructurePlanKind = "create" | "destructive";

export type StructureActionBase = {
  /** Client-local reference for dependency resolution, e.g. "$building1" */
  ref?: string;
  description: string;
};

export type CreateBuildingAction = StructureActionBase & {
  type: "create_building";
  label: string;
  routing_description: string;
  position_x?: number;
  position_z?: number;
  size_w?: number;
  size_d?: number;
  color?: string;
};

export type CreateChamberAction = StructureActionBase & {
  type: "create_chamber";
  /** Registry id of parent building OR ref like "$building1" */
  building_ref: string;
  name: string;
  routing_description?: string;
  x?: number;
  z?: number;
  width?: number;
  depth?: number;
  routing_role?: "main" | null;
};

export type CreateConnectionAction = StructureActionBase & {
  type: "create_connection";
  source_ref: string;
  target_ref: string;
  read_knowledge?: boolean;
  read_rules?: boolean;
  read_results?: boolean;
  send_tasks?: boolean;
};

export type AssignAgentAction = StructureActionBase & {
  type: "assign_agent";
  /** Agent registry id (same as agents.id) */
  agent_id: string;
  /** Chamber registry id OR ref like "$chamber1" */
  chamber_ref: string;
  role?: string;
};

export type DeleteBuildingAction = StructureActionBase & {
  type: "delete_building";
  /** Building entity_registry id (same as office_objects.id for rooms) */
  building_id: string;
};

export type DeleteChamberAction = StructureActionBase & {
  type: "delete_chamber";
  /** Chamber entity_registry id */
  chamber_registry_id: string;
};

export type DeleteConnectionAction = StructureActionBase & {
  type: "delete_connection";
  /** connections.id */
  connection_id: string;
};

export type UnassignAgentAction = StructureActionBase & {
  type: "unassign_agent";
  agent_id: string;
  /** Chamber entity_registry id */
  chamber_ref: string;
};

export type StructureAction =
  | CreateBuildingAction
  | CreateChamberAction
  | CreateConnectionAction
  | AssignAgentAction
  | DeleteBuildingAction
  | DeleteChamberAction
  | DeleteConnectionAction
  | UnassignAgentAction;

/** Fixed schema for tech_structure_snapshots.entities (TD-03B). */
export type StructureSnapshotEntities = {
  entity_registry: Record<string, unknown>[];
  office_objects: Record<string, unknown>[];
  chambers: Record<string, unknown>[];
  connections: Record<string, unknown>[];
  connection_permissions: Record<string, unknown>[];
  agent_assignments: Record<string, unknown>[];
  workflow_steps: Record<string, unknown>[];
  agent_debates: Record<string, unknown>[];
  chamber_archive: Record<string, unknown>[];
};

export type StructureImpactCounts = {
  entity_registry: number;
  office_objects: number;
  chambers: number;
  connections: number;
  connection_permissions: number;
  agent_assignments: number;
  workflow_steps: number;
  agent_debates: number;
  chamber_archive: number;
};

export type StructureImpactAnalysis = {
  counts: StructureImpactCounts;
  /** Human-readable lines for confirmation UI */
  summaryLines: string[];
};

export type TechStructurePlan = {
  planId: string;
  taskText: string;
  summary: string;
  actions: StructureAction[];
  expiresAt: string;
  planKind: StructurePlanKind;
  impactAnalysis?: StructureImpactAnalysis;
  snapshotId?: string;
};

export type StructureExecutionResult = {
  planId: string;
  executed: Array<{ actionIndex: number; type: StructureActionType; ok: boolean; detail: string }>;
};

export function isDestructiveStructureAction(
  action: StructureAction,
): action is
  | DeleteBuildingAction
  | DeleteChamberAction
  | DeleteConnectionAction
  | UnassignAgentAction {
  return (
    action.type === "delete_building" ||
    action.type === "delete_chamber" ||
    action.type === "delete_connection" ||
    action.type === "unassign_agent"
  );
}

export function planHasDestructiveActions(actions: StructureAction[]): boolean {
  return actions.some(isDestructiveStructureAction);
}
