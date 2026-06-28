export const WORKSPACE_PENDING_ROUTE_KEY = "workspacePendingRoute";

/** Cross-tab sync event (same tab + other tabs). */
export const WORKSPACE_PENDING_ROUTE_EVENT = "workspace-pending-route";

/** Ignore stale payloads older than 5 minutes. */
export const PENDING_ROUTE_MAX_AGE_MS = 5 * 60 * 1000;

export type WorkspacePendingRouteAgent = {
  agentDbId: string;
  slug: string;
  status: "launched" | "success" | "error";
  agentName?: string;
};

export type WorkspacePendingRoute = {
  source: "mission-control";
  createdAt: string;
  updatedAt: string;
  phase: "running" | "complete";
  taskText: string;
  routing: {
    targetEntityRegistryId: string;
    routeViaEntityId?: string;
    usedConnectionId?: string;
    method: string;
    targetName?: string;
  };
  agents: WorkspacePendingRouteAgent[];
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function pendingRouteFingerprint(payload: WorkspacePendingRoute): string {
  return JSON.stringify({
    phase: payload.phase,
    taskText: payload.taskText,
    routing: payload.routing,
    agents: payload.agents.map((a) => ({
      agentDbId: a.agentDbId,
      slug: a.slug,
      status: a.status,
    })),
  });
}

function pendingWorkflowFingerprint(payload: WorkspacePendingWorkflow): string {
  return JSON.stringify({
    workflowId: payload.workflowId,
    phase: payload.phase,
    workflowStatus: payload.workflowStatus,
    taskText: payload.taskText,
    steps: payload.steps.map((s) => ({
      step_order: s.step_order,
      status: s.status,
    })),
  });
}

function readStoredFingerprint(key: string): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspacePendingRoute | WorkspacePendingWorkflow;
    if (key === WORKSPACE_PENDING_ROUTE_KEY && parsed && "routing" in parsed) {
      return pendingRouteFingerprint(parsed as WorkspacePendingRoute);
    }
    if (key === WORKSPACE_PENDING_WORKFLOW_KEY && parsed && "workflowId" in parsed) {
      return pendingWorkflowFingerprint(parsed as WorkspacePendingWorkflow);
    }
    return null;
  } catch {
    return null;
  }
}

export function writeWorkspacePendingRoute(payload: WorkspacePendingRoute): void {
  const store = storage();
  if (!store) return;
  try {
    const fingerprint = pendingRouteFingerprint(payload);
    if (readStoredFingerprint(WORKSPACE_PENDING_ROUTE_KEY) === fingerprint) {
      return;
    }
    store.setItem(WORKSPACE_PENDING_ROUTE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(WORKSPACE_PENDING_ROUTE_EVENT, { detail: payload }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readWorkspacePendingRoute(): WorkspacePendingRoute | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(WORKSPACE_PENDING_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspacePendingRoute;
    if (parsed?.source !== "mission-control" || !parsed.routing?.targetEntityRegistryId) {
      return null;
    }
    if (!parsed.phase) parsed.phase = "complete";
    if (!parsed.updatedAt) parsed.updatedAt = parsed.createdAt;
    return parsed;
  } catch {
    return null;
  }
}

export function clearWorkspacePendingRoute(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(WORKSPACE_PENDING_ROUTE_KEY);
  } catch {
    /* ignore */
  }
}

export function isPendingRouteFresh(pending: WorkspacePendingRoute): boolean {
  const age = Date.now() - new Date(pending.createdAt).getTime();
  return age >= 0 && age <= PENDING_ROUTE_MAX_AGE_MS;
}

export const WORKSPACE_PENDING_WORKFLOW_KEY = "workspacePendingWorkflow";

/** Cross-tab sync for Mission Control multi-step workflows. */
export const WORKSPACE_PENDING_WORKFLOW_EVENT = "workspace-pending-workflow";

export type WorkspacePendingWorkflowStep = {
  step_order: number;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  target_chamber?: { id: string; name: string; entity_type?: string } | null;
  assigned_agent?: { id: string; name: string } | null;
};

export type WorkspacePendingWorkflow = {
  source: "mission-control";
  createdAt: string;
  updatedAt: string;
  phase: "running" | "complete";
  workflowId: string;
  taskText: string;
  workflowStatus: string;
  steps: WorkspacePendingWorkflowStep[];
};

export function workflowPhaseFromStatus(status: string): "running" | "complete" {
  return status === "completed" || status === "failed" ? "complete" : "running";
}

export function workflowStepsFromApi(
  steps: Array<{
    step_order: number;
    status: string;
    input_summary?: string | null;
    output_summary?: string | null;
    target_chamber?: { id: string; name: string; entity_type?: string } | null;
    assigned_agent?: { id: string; name: string } | null;
  }>,
): WorkspacePendingWorkflowStep[] {
  return steps.map((s) => ({
    step_order: s.step_order,
    status: s.status,
    input_summary: s.input_summary ?? null,
    output_summary: s.output_summary ?? null,
    target_chamber: s.target_chamber ?? null,
    assigned_agent: s.assigned_agent ?? null,
  }));
}

export function writeWorkspacePendingWorkflow(payload: WorkspacePendingWorkflow): void {
  const store = storage();
  if (!store) return;
  try {
    const fingerprint = pendingWorkflowFingerprint(payload);
    if (readStoredFingerprint(WORKSPACE_PENDING_WORKFLOW_KEY) === fingerprint) {
      return;
    }
    store.setItem(WORKSPACE_PENDING_WORKFLOW_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(WORKSPACE_PENDING_WORKFLOW_EVENT, { detail: payload }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readWorkspacePendingWorkflow(): WorkspacePendingWorkflow | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(WORKSPACE_PENDING_WORKFLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspacePendingWorkflow;
    if (parsed?.source !== "mission-control" || !parsed.workflowId || !parsed.steps?.length) {
      return null;
    }
    if (!parsed.phase) parsed.phase = workflowPhaseFromStatus(parsed.workflowStatus);
    if (!parsed.updatedAt) parsed.updatedAt = parsed.createdAt;
    return parsed;
  } catch {
    return null;
  }
}

export function clearWorkspacePendingWorkflow(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(WORKSPACE_PENDING_WORKFLOW_KEY);
  } catch {
    /* ignore */
  }
}

export function isPendingWorkflowFresh(pending: WorkspacePendingWorkflow): boolean {
  const age = Date.now() - new Date(pending.createdAt).getTime();
  return age >= 0 && age <= PENDING_ROUTE_MAX_AGE_MS;
}
