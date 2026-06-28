export type StructureActionType =
  | "create_building"
  | "create_chamber"
  | "create_connection"
  | "assign_agent";

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

export type StructureAction =
  | CreateBuildingAction
  | CreateChamberAction
  | CreateConnectionAction
  | AssignAgentAction;

export type TechStructurePlan = {
  planId: string;
  taskText: string;
  summary: string;
  actions: StructureAction[];
  expiresAt: string;
};

export type StructureExecutionResult = {
  planId: string;
  executed: Array<{ actionIndex: number; type: StructureActionType; ok: boolean; detail: string }>;
};
