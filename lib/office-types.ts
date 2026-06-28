export type AgentStatus = "online" | "offline" | "error";
export type LogStatus = "success" | "error" | "pending";

export interface OfficeRow {
  id: string;
  name: string;
  rules: string;
  created_at: string;
  scene_paint?: {
    floorInner?: string;
    floorOuter?: string;
    edge?: string;
  } | null;
  workspace_meta?: Record<string, unknown> | null;
}

export interface AgentRow {
  id: string;
  office_id: string | null;
  name: string;
  provider: string;
  model_id: string;
  status: AgentStatus;
  cost_tier?: "free" | "cheap" | "mid" | "premium" | "expensive";
  color?: string | null;
  category?: string | null;
  created_at: string;
}

export interface RequestLogRow {
  id: string;
  office_id: string;
  agent_id: string | null;
  question: string;
  response: string | null;
  status: LogStatus;
  latency_ms: number | null;
  created_at: string;
  agents?: { name: string } | null;
}

export interface KnowledgeRow {
  id: string;
  office_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface AgentStats {
  total: number;
  success: number;
  error: number;
}

export interface OfficeConnectionRow {
  id: string;
  office_id: string;
  from_agent_id: string;
  to_agent_id: string;
  created_at: string;
}

/** Кабель от главного офиса (hub) к помещению-офису */
export interface OfficeLinkRow {
  id: string;
  office_id: string;
  to_room_id: string;
  created_at: string;
}

export type OfficeObjectType =
  | "desk"
  | "wall"
  | "door"
  | "cabinet"
  | "board"
  | "room"
  | "tree"
  | "bush"
  | "flower";

export interface OfficeObjectRow {
  id: string;
  office_id: string;
  object_type: OfficeObjectType;
  position_x: number;
  position_z: number;
  rotation_y: number;
  agent_id: string | null;
  color: string | null;
  size_w: number | null;
  size_d: number | null;
  label: string | null;
  building_role?: string | null;
  created_at: string;
  agents?: AgentRow | null;
}

export interface EntityRegistryRow {
  id: string;
  entity_type: string;
  name: string;
  slug: string;
  parent_entity_id: string | null;
  routing_description?: string | null;
  created_at: string;
}

export interface ChamberRow {
  id: string;
  entity_registry_id: string;
  building_entity_id: string;
  building_object_id: string | null;
  manager_agent_id: string | null;
  /** 'main' = primary entry point of the building; null = not designated. */
  routing_role?: string | null;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color?: string | null;
  created_at: string;
  entity_registry?: EntityRegistryRow;
}

export interface UniversalKnowledgeRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_registry_id?: string | null;
  object_id: string | null;
  title: string;
  content: string | null;
  file_url: string | null;
  created_at: string;
}

export interface RuleRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_registry_id?: string | null;
  object_id: string | null;
  rule_text: string;
  created_at: string;
}

export interface AgentAssignmentRow {
  id: string;
  agent_id: string;
  chamber_id: string;
  role: string | null;
  layout_x?: number | null;
  layout_y?: number | null;
  layout_size?: number | null;
  created_at: string;
  agents?: AgentRow | null;
}

export type KnowledgeRef = {
  id: string;
  title: string;
  /** Catalog description for search — not necessarily full file text. */
  content: string | null;
  /** Full document text when opened for the current task. */
  body: string | null;
  fileUrl: string | null;
  opened: boolean;
};

export type ContextLayer = {
  entityRegistryId: string;
  entityType: string;
  entityName: string;
  rules: string[];
  knowledge: KnowledgeRef[];
};

export type BuiltContext = {
  layers: ContextLayer[];
  flattenedPrompt: string;
  tokenEstimate: number;
};

export type BuildContextOptions = {
  /** Explicit chamber registry id when building context for an agent (many-to-many assignments). */
  chamberRegistryId?: string;
  /** User task — used to open only relevant library documents by title/description. */
  taskText?: string;
};

export type RouteCandidate = {
  entityRegistryId: string;
  confidence: number; // 0-1
  reason: string;
};

export type RoutingScoreDetail = {
  matchedRules: string[];
  matchedKeywords: string[];
  llmReason: string | null;
};

export type RouteDecision = {
  targets: RouteCandidate[];
  method: 'rule-based' | 'llm-cheap' | 'llm-expensive' | 'fallback' | 'fallback-blocked' | 'tech-structure-plan' | 'tech-code-audit';
  agentCount: number;
  scoreDetail?: RoutingScoreDetail;
  routingLogId?: string;
  /** Set when routing forwarded via an active connection from sourceEntityId. */
  usedConnectionId?: string;
  routeViaEntityId?: string;
};

export type FeedbackOutcome = 'good' | 'bad' | 'unrated';

export interface ConnectionRoutePath {
  version: 1;
  points: Array<{ x: number; y: number }>;
}

export interface ConnectionRow {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  route_path?: ConnectionRoutePath | null;
  color?: string | null;
  connection_permissions?: ConnectionPermissionRow;
}

export interface ConnectionPermissionRow {
  connection_id: string;
  read_knowledge: boolean;
  read_rules: boolean;
  read_results: boolean;
  send_tasks: boolean;
}

export interface ConnectionLogRow {
  id: string;
  connection_id: string;
  payload_type: 'knowledge' | 'rules' | 'results' | 'task';
  summary: string | null;
  created_at: string;
}

export type WorkflowStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type WorkflowStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface WorkflowRow {
  id: string;
  task_text: string;
  status: WorkflowStatus;
  final_output: string | null;
  outcome: FeedbackOutcome;
  outcome_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface WorkflowStepRow {
  id: string;
  workflow_id: string;
  step_order: number;
  target_chamber_entity_id: string;
  assigned_agent_id: string | null;
  status: WorkflowStepStatus;
  input_summary: string | null;
  output_summary: string | null;
  output_full: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  target_chamber?: EntityRegistryRow | null;
  assigned_agent?: AgentRow | null;
}

export type WorkflowPlanStep = {
  targetChamberEntityId: string;
  reason: string;
};

export type WorkflowPlan = {
  needsWorkflow: boolean;
  steps: WorkflowPlanStep[];
};

export type PlanWorkflowResult = {
  plan: WorkflowPlan;
  routeDecision: import("./office-types").RouteDecision;
};

export type FloorViewState = {
  mode: "city" | "use" | "edit";
  editSubMode?: "build" | "communications";
  selectedBuildingId: string | null;
};

/**
 * Formal contract returned by resolveManagerRoutingDecision().
 */
export type ManagerRoutingDecision = {
  action: "answer_self" | "delegate";
  /** entityRegistryId of the target internal chamber when delegating. */
  target?: string;
  buildingId: string;
  managerChamberId: string;
  delegatedChamberId?: string | null;
  matchedBy: "explicit_name" | "semantic";
  confidence: number;
  reasoning: string;
  trace: string[];
};

/**
 * Formal contract for Mayor routing decisions (MR-2: configured Mayor agent or deterministic structure gate).
 */
export type MayorRoutingDecision = {
  /** Whether Mayor handles the task itself or delegates to another building. */
  action: "answer_self" | "delegate" | "clarify";
  /** entityRegistryId of the target building — set only when action='delegate'. */
  target?: string;
  /** entityRegistryId of the resolved delegate building — set only when action='delegate'. */
  delegatedBuildingId?: string | null;
  /** entityRegistryId of the resolved main chamber for the delegate building. */
  delegatedChamberId?: string | null;
  /**
   * How the target was identified:
   * - 'explicit_name': user named the building/project directly
   * - 'semantic': Mayor inferred from task context, no explicit name
   * - 'structure_command': deterministic keyword gate (admin/system mutation commands)
   * - 'structure_command_llm': legacy log value only (removed in MR-2)
   */
  matchedBy: "explicit_name" | "semantic" | "structure_command" | "structure_command_llm";
  /** Confidence 0-1 */
  confidence: number;
  /** Human-readable explanation (internal, not shown to user) */
  reasoning: string;
  /** Machine-readable trace list, used in logs and tests */
  trace: string[];
};
