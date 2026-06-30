"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ExecutionMode } from "@/lib/execution-mode";
import type { ChatWorkflowStep, ExecuteChatTaskResult } from "@/lib/execute-chat-task";
import type { AgentAssignmentRow, ChamberRow, OfficeObjectRow, RouteDecision } from "@/lib/office-types";
import type {
  ExecutionProgressState,
  RosterAgent,
} from "@/lib/workspace/execution-progress";
import {
  buildExecutionAgentSlots,
  finalizeExecutionProgress,
} from "@/lib/workspace/execution-progress";
import {
  resolveRouteHighlight,
  type RouteHighlightStep,
} from "@/lib/workspace/resolve-route-highlight";
import {
  buildRouteAnimationPlan,
  type MayorRouteOrigin,
  type RouteAnimationSegment,
} from "@/lib/workspace/route-animation-sequence";
import { computeRouteRevealStepMs } from "@/lib/workspace/route-reveal-timing";
import { resolveMissionRouteHighlight } from "@/lib/workspace/resolve-mission-route-highlight";
import {
  clearWorkspacePendingRoute,
  clearWorkspacePendingWorkflow,
  isPendingRouteFresh,
  isPendingWorkflowFresh,
  readWorkspacePendingRoute,
  readWorkspacePendingWorkflow,
  WORKSPACE_PENDING_ROUTE_EVENT,
  WORKSPACE_PENDING_ROUTE_KEY,
  WORKSPACE_PENDING_WORKFLOW_EVENT,
  WORKSPACE_PENDING_WORKFLOW_KEY,
  type WorkspacePendingRoute,
  type WorkspacePendingWorkflow,
} from "@/lib/mission-workspace-bridge";
import {
  bridgeStepsToChatSteps,
  resolveMissionWorkflowLiveHighlight,
} from "@/lib/workspace/resolve-mission-workflow-highlight";
import {
  resolveWorkflowHighlight,
  type WorkflowStepHighlightResult,
} from "@/lib/workspace/resolve-workflow-highlight";

export type RouteSignalPhase = "outbound" | "processing" | "return";

export type RouteSignalTone = "active" | "success";

export type RouteHighlightState = {
  steps: RouteHighlightStep[];
  connectionIds: string[];
  fading: boolean;
  /** Live signal traveling on the active connection during chat execution. */
  signalActive?: boolean;
  activeConnectionId?: string;
  /** Sequential Tron pulse along route steps (0-based index into steps). */
  signalPhase?: RouteSignalPhase;
  activeStepIndex?: number;
  signalDirection?: "forward" | "reverse";
  /** Yellow while traveling; green on successful return. */
  signalTone?: RouteSignalTone;
  /** Ordered animation timeline mixing nodes, edges, and processing. */
  animationSegments?: RouteAnimationSegment[];
  /** Current index into animationSegments. */
  activeSegmentIndex?: number;
  /** Segment indices already lit green during return. */
  litSegmentIndices?: number[];
  workflowStepCurrent?: number;
  workflowStepTotal?: number;
  workflowTargetNodeId?: string;
} | null;

export type WorkflowReplayState = {
  resolvedSteps: WorkflowStepHighlightResult[];
  currentIndex: number;
  fading: boolean;
  isPlaying: boolean;
} | null;

type RouteLookup = {
  chambers: ChamberRow[];
  buildings: OfficeObjectRow[];
  assignments: AgentAssignmentRow[];
};

const ROUTE_HOLD_MS = 4000;
const ROUTE_FADE_MS = 1000;
const WORKFLOW_STEP_HOLD_MS = 4000;
const WORKFLOW_STEP_FADE_MS = 1000;

function applyAgentStatusesFromResult(
  progress: ExecutionProgressState,
  result: ExecuteChatTaskResult,
  stepLabel: string,
): ExecutionProgressState {
  const finalized = finalizeExecutionProgress(progress, result, stepLabel);
  return {
    ...finalized,
    phase: "executing",
  };
}

type WorkspaceRouteContextValue = {
  routeHighlight: RouteHighlightState;
  activeRouteHighlight: RouteHighlightState;
  workflowReplay: WorkflowReplayState;
  executionProgress: ExecutionProgressState | null;
  routeSourceEntityId: string | null;
  setRouteSourceEntityId: (id: string | null) => void;
  registerRouteLookup: (lookup: RouteLookup) => void;
  beginExecutionProgress: (input: {
    taskText: string;
    mode: ExecutionMode;
    roster: RosterAgent[];
    agentCount?: number;
  }) => ExecutionProgressState;
  markExecutionRouting: (
    decision: RouteDecision,
    targetName: string | null,
    roster?: RosterAgent[],
    agentCount?: number,
    mayorOrigin?: MayorRouteOrigin | null,
  ) => void;
  markExecutionRunning: (stepLabel: string) => void;
  tickExecutionActiveAgent: () => void;
  completeExecutionProgress: (
    result: ExecuteChatTaskResult,
    stepLabel: string,
  ) => void;
  failExecutionProgress: (message: string) => void;
  clearExecutionProgress: () => void;
  applyChatRoute: (result: ExecuteChatTaskResult) => RouteHighlightStep[] | null;
  startWorkflowReplay: (steps: ChatWorkflowStep[]) => void;
  clearRouteHighlight: () => void;
};

const WorkspaceRouteContext = createContext<WorkspaceRouteContextValue | null>(null);

export function WorkspaceRouteProvider({ children }: { children: ReactNode }) {
  const [routeHighlight, setRouteHighlight] = useState<RouteHighlightState>(null);
  const [workflowReplay, setWorkflowReplay] = useState<WorkflowReplayState>(null);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgressState | null>(
    null,
  );
  const [routeSourceEntityId, setRouteSourceEntityId] = useState<string | null>(null);
  const lookupRef = useRef<RouteLookup>({ chambers: [], buildings: [], assignments: [] });
  const lastAppliedWorkflowRef = useRef<string | null>(null);
  const lastReplayedWorkflowIdRef = useRef<string | null>(null);
  const routeTimersRef = useRef<{
    hold?: ReturnType<typeof setTimeout>;
    fade?: ReturnType<typeof setTimeout>;
  }>({});
  const workflowTimersRef = useRef<{
    hold?: ReturnType<typeof setTimeout>;
    fade?: ReturnType<typeof setTimeout>;
  }>({});
  const signalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const returnTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isProgrammaticPlaybackRef = useRef(false);

  const clearSignalTimers = useCallback(() => {
    if (signalTimerRef.current) {
      clearInterval(signalTimerRef.current);
      signalTimerRef.current = null;
    }
    for (const t of returnTimersRef.current) clearTimeout(t);
    returnTimersRef.current = [];
  }, []);

  const clearSignalInterval = useCallback(() => {
    if (signalTimerRef.current) {
      clearInterval(signalTimerRef.current);
      signalTimerRef.current = null;
    }
  }, []);

  const clearRouteTimers = useCallback(() => {
    if (routeTimersRef.current.hold) clearTimeout(routeTimersRef.current.hold);
    if (routeTimersRef.current.fade) clearTimeout(routeTimersRef.current.fade);
    routeTimersRef.current = {};
    clearSignalTimers();
  }, [clearSignalTimers]);

  const clearWorkflowTimers = useCallback(() => {
    if (workflowTimersRef.current.hold) clearTimeout(workflowTimersRef.current.hold);
    if (workflowTimersRef.current.fade) clearTimeout(workflowTimersRef.current.fade);
    workflowTimersRef.current = {};
  }, []);

  const clearRouteHighlight = useCallback(() => {
    clearRouteTimers();
    setRouteHighlight(null);
    isProgrammaticPlaybackRef.current = false;
  }, [clearRouteTimers]);

  const stopWorkflowReplay = useCallback(() => {
    clearWorkflowTimers();
    setWorkflowReplay(null);
  }, [clearWorkflowTimers]);

  const scheduleRouteFade = useCallback(() => {
    clearRouteTimers();
    routeTimersRef.current.hold = setTimeout(() => {
      setRouteHighlight((prev) => (prev ? { ...prev, fading: true } : null));
      routeTimersRef.current.fade = setTimeout(() => {
        setRouteHighlight(null);
        isProgrammaticPlaybackRef.current = false;
      }, ROUTE_FADE_MS);
    }, ROUTE_HOLD_MS);
  }, [clearRouteTimers]);

  const applyPendingMissionRoute = useCallback(
    (pending: WorkspacePendingRoute) => {
      if (!isPendingRouteFresh(pending)) {
        clearWorkspacePendingRoute();
        return;
      }

      const resolved = resolveMissionRouteHighlight(
        pending,
        lookupRef.current.chambers,
        lookupRef.current.buildings,
        lookupRef.current.assignments,
      );
      if (!resolved?.steps.length) {
        if (pending.phase === "complete") clearWorkspacePendingRoute();
        return;
      }

      stopWorkflowReplay();
      clearRouteTimers();
      setRouteHighlight({
        steps: resolved.steps,
        connectionIds: resolved.connectionIds,
        fading: false,
      });

      if (pending.phase === "complete") {
        clearWorkspacePendingRoute();
        scheduleRouteFade();
      }
    },
    [clearRouteTimers, scheduleRouteFade, stopWorkflowReplay],
  );

  const tryConsumePendingMissionRoute = useCallback(() => {
    const pending = readWorkspacePendingRoute();
    if (!pending) return;
    applyPendingMissionRoute(pending);
  }, [applyPendingMissionRoute]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WORKSPACE_PENDING_ROUTE_KEY || !event.newValue) return;
      tryConsumePendingMissionRoute();
    };

    const onCustom = () => {
      tryConsumePendingMissionRoute();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(WORKSPACE_PENDING_ROUTE_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(WORKSPACE_PENDING_ROUTE_EVENT, onCustom);
    };
  }, [tryConsumePendingMissionRoute]);

  const scheduleWorkflowStep = useCallback(
    (index: number, total: number) => {
      clearWorkflowTimers();
      workflowTimersRef.current.hold = setTimeout(() => {
        setWorkflowReplay((prev) => (prev ? { ...prev, fading: true } : null));
        workflowTimersRef.current.fade = setTimeout(() => {
          const next = index + 1;
          if (next >= total) {
            setWorkflowReplay(null);
            return;
          }
          setWorkflowReplay((prev) =>
            prev ? { ...prev, currentIndex: next, fading: false } : null,
          );
          scheduleWorkflowStep(next, total);
        }, WORKFLOW_STEP_FADE_MS);
      }, WORKFLOW_STEP_HOLD_MS);
    },
    [clearWorkflowTimers],
  );

  const startWorkflowReplay = useCallback(
    (steps: ChatWorkflowStep[]) => {
      clearRouteHighlight();
      stopWorkflowReplay();

      const resolved = resolveWorkflowHighlight(
        steps,
        lookupRef.current.chambers,
        lookupRef.current.buildings,
        lookupRef.current.assignments,
      );
      if (!resolved.length) return;

      setWorkflowReplay({
        resolvedSteps: resolved,
        currentIndex: 0,
        fading: false,
        isPlaying: true,
      });
      scheduleWorkflowStep(0, resolved.length);
    },
    [clearRouteHighlight, stopWorkflowReplay, scheduleWorkflowStep],
  );

  const applyPendingMissionWorkflow = useCallback(
    (pending: WorkspacePendingWorkflow) => {
      if (!isPendingWorkflowFresh(pending)) {
        clearWorkspacePendingWorkflow();
        return;
      }

      const chatSteps = bridgeStepsToChatSteps(pending.steps);

      if (pending.phase === "complete") {
        if (lastReplayedWorkflowIdRef.current === pending.workflowId) return;
        lastReplayedWorkflowIdRef.current = pending.workflowId;
        lastAppliedWorkflowRef.current = null;
        clearWorkspacePendingWorkflow();
        startWorkflowReplay(chatSteps);
        return;
      }

      const resolved = resolveMissionWorkflowLiveHighlight(
        pending,
        lookupRef.current.chambers,
        lookupRef.current.buildings,
        lookupRef.current.assignments,
      );
      if (!resolved?.steps.length) return;

      const stepSig = pending.steps.map((s) => `${s.step_order}:${s.status}`).join("|");
      const fingerprint = `${pending.workflowId}:${resolved.stepOrder}:${stepSig}`;
      if (lastAppliedWorkflowRef.current === fingerprint) return;
      lastAppliedWorkflowRef.current = fingerprint;

      stopWorkflowReplay();
      clearRouteTimers();
      setRouteHighlight({
        steps: resolved.steps,
        connectionIds: resolved.connectionIds,
        fading: false,
        workflowStepCurrent: resolved.stepOrder,
        workflowStepTotal: resolved.stepTotal,
        workflowTargetNodeId: resolved.chamberId,
      });
    },
    [clearRouteTimers, startWorkflowReplay, stopWorkflowReplay],
  );

  const tryConsumePendingMissionWorkflow = useCallback(() => {
    const pending = readWorkspacePendingWorkflow();
    if (!pending) return;
    applyPendingMissionWorkflow(pending);
    if (pending.phase === "complete") {
      clearWorkspacePendingWorkflow();
    }
  }, [applyPendingMissionWorkflow]);

  const registerRouteLookup = useCallback(
    (lookup: RouteLookup) => {
      lookupRef.current = lookup;
      tryConsumePendingMissionRoute();
      tryConsumePendingMissionWorkflow();
    },
    [tryConsumePendingMissionRoute, tryConsumePendingMissionWorkflow],
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WORKSPACE_PENDING_WORKFLOW_KEY || !event.newValue) return;
      tryConsumePendingMissionWorkflow();
    };

    const onCustom = () => {
      tryConsumePendingMissionWorkflow();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(WORKSPACE_PENDING_WORKFLOW_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(WORKSPACE_PENDING_WORKFLOW_EVENT, onCustom);
    };
  }, [tryConsumePendingMissionWorkflow]);

  const mayorOriginRef = useRef<MayorRouteOrigin | null>(null);

  const startRouteReveal = useCallback(
    (plan: NonNullable<ReturnType<typeof buildRouteAnimationPlan>>) => {
      isProgrammaticPlaybackRef.current = true;
      clearSignalTimers();

      const maxIndex = Math.max(0, plan.segments.length - 1);
      const stepMs = computeRouteRevealStepMs(plan.segments.length);

      setRouteHighlight({
        steps: plan.steps,
        connectionIds: plan.connectionIds,
        animationSegments: plan.segments,
        fading: false,
        signalActive: true,
        activeConnectionId: plan.connectionIds[0],
        signalPhase: "outbound",
        signalTone: "active",
        activeSegmentIndex: maxIndex === 0 ? 0 : 0,
        activeStepIndex: 0,
        signalDirection: "forward",
        litSegmentIndices: [],
      });

      if (maxIndex === 0 || stepMs === 0) {
        setRouteHighlight((prev) =>
          prev
            ? {
                ...prev,
                activeSegmentIndex: maxIndex,
                activeStepIndex: maxIndex,
                signalPhase: "processing",
              }
            : prev,
        );
        return;
      }

      let currentIndex = 0;
      signalTimerRef.current = setInterval(() => {
        currentIndex += 1;
        if (currentIndex <= maxIndex) {
          setRouteHighlight((prev) => {
            if (!prev?.animationSegments?.length) return prev;
            const segment = prev.animationSegments[currentIndex];
            return {
              ...prev,
              activeSegmentIndex: currentIndex,
              activeStepIndex: currentIndex,
              signalPhase: segment?.kind === "processing" ? "processing" : "outbound",
            };
          });
        }
        if (currentIndex >= maxIndex) {
          clearSignalInterval();
        }
      }, stepMs);
    },
    [clearSignalInterval, clearSignalTimers],
  );

  const applyLiveRouteFromDecision = useCallback(
    (
      decision: RouteDecision,
      targetName: string | null,
      signalActive: boolean,
      rosterAgentIds: string[] = [],
    ) => {
      const stub: ExecuteChatTaskResult = {
        mode: "single",
        executionMode: "fast",
        answer: "",
        routing: decision,
        targetName,
        agentName: null,
        agentId: null,
      };
      const plan = buildRouteAnimationPlan(
        stub,
        lookupRef.current.chambers,
        lookupRef.current.buildings,
        lookupRef.current.assignments,
        mayorOriginRef.current,
        rosterAgentIds,
      );
      if (!plan?.steps.length) return;

      stopWorkflowReplay();
      clearRouteTimers();

      if (signalActive && plan.segments.length > 0) {
        startRouteReveal(plan);
        return;
      }

      setRouteHighlight({
        steps: plan.steps,
        connectionIds: plan.connectionIds,
        animationSegments: plan.segments,
        fading: false,
        signalActive,
        activeConnectionId: decision.usedConnectionId,
      });
    },
    [clearRouteTimers, startRouteReveal, stopWorkflowReplay],
  );

  const beginExecutionProgress = useCallback(
    (input: {
      taskText: string;
      mode: ExecutionMode;
      roster: RosterAgent[];
      agentCount?: number;
    }): ExecutionProgressState => {
      const progress: ExecutionProgressState = {
        taskText: input.taskText,
        mode: input.mode,
        phase: "routing",
        agents: buildExecutionAgentSlots(input.mode, input.roster, input.agentCount),
        activeAgentIndex: 0,
      };
      setExecutionProgress(progress);
      return progress;
    },
    [],
  );

  const markExecutionRouting = useCallback(
    (
      decision: RouteDecision,
      targetName: string | null,
      roster?: RosterAgent[],
      agentCount?: number,
      mayorOrigin?: MayorRouteOrigin | null,
    ) => {
      mayorOriginRef.current = mayorOrigin ?? null;
      const actualRoster =
        roster && roster.length > 0
          ? roster
          : [];
      const rosterAgentIds = actualRoster.map((a) => a.id);
      applyLiveRouteFromDecision(decision, targetName, false, rosterAgentIds);
      setExecutionProgress((prev) => {
        if (!prev) return null;
        const rosterForSlots =
          roster && roster.length > 0
            ? roster
            : prev.agents.map((a) => ({ id: a.agentId, name: a.agentName, slug: "" }));
        const actualCount = agentCount ?? rosterForSlots.length;
        const agents = buildExecutionAgentSlots(prev.mode, rosterForSlots, actualCount);
        const allWorking = agents.length > 0;
        return {
          ...prev,
          phase: "executing",
          connectionId: decision.usedConnectionId,
          currentStepLabel: targetName
            ? `Маршрут → ${targetName}`
            : "Выполнение запроса",
          agents: agents.map((a) => ({
            ...a,
            status: allWorking ? "working" : "pending",
            stepLabel: targetName ? `Маршрут → ${targetName}` : undefined,
          })),
        };
      });
    },
    [applyLiveRouteFromDecision],
  );

  const markExecutionRunning = useCallback((stepLabel: string) => {
    setExecutionProgress((prev) =>
      prev ? { ...prev, phase: "executing", currentStepLabel: stepLabel } : prev,
    );
  }, []);

  const tickExecutionActiveAgent = useCallback(() => {
    setExecutionProgress((prev) => {
      if (!prev || prev.phase !== "executing" || prev.agents.length === 0) return prev;
      const nextIndex = (prev.activeAgentIndex + 1) % prev.agents.length;
      return {
        ...prev,
        activeAgentIndex: nextIndex,
        agents: prev.agents.map((agent, index) => ({
          ...agent,
          status:
            index === nextIndex
              ? "working"
              : agent.status === "working"
                ? "pending"
                : agent.status,
        })),
      };
    });
  }, []);

  const completeExecutionProgress = useCallback(
    (result: ExecuteChatTaskResult, stepLabel: string) => {
      clearSignalTimers();
      clearRouteTimers();
      isProgrammaticPlaybackRef.current = false;

      if (result.mode !== "single") {
        setExecutionProgress((prev) =>
          prev ? finalizeExecutionProgress(prev, result, stepLabel) : prev,
        );
        setRouteHighlight(null);
        return;
      }

      setExecutionProgress((prev) =>
        prev ? applyAgentStatusesFromResult(prev, result, stepLabel) : prev,
      );

      requestAnimationFrame(() => {
        setExecutionProgress((prev) =>
          prev ? finalizeExecutionProgress(prev, result, stepLabel) : prev,
        );
        setRouteHighlight(null);
      });
    },
    [clearRouteTimers, clearSignalTimers],
  );

  const failExecutionProgress = useCallback(
    (message: string) => {
      isProgrammaticPlaybackRef.current = false;
      setExecutionProgress((prev) =>
        prev
          ? {
              ...prev,
              phase: "error",
              currentStepLabel: message,
              resultStatus: {
                kind: "full_failure",
                title: "Сбой",
                detail: message,
                hasAnswer: false,
                failedItems: prev.agents
                  .filter((a) => a.status === "error" || a.status === "working" || a.status === "pending")
                  .map((a) => ({
                    label: a.agentName,
                    error: a.error ?? message,
                  })),
              },
              agents: prev.agents.map((a) =>
                a.status === "working" || a.status === "pending"
                  ? { ...a, status: "error", error: message }
                  : a,
              ),
            }
          : prev,
      );
      clearRouteHighlight();
    },
    [clearRouteHighlight],
  );

  const clearExecutionProgress = useCallback(() => {
    setExecutionProgress(null);
  }, []);

  const applyChatRoute = useCallback(
    (result: ExecuteChatTaskResult): RouteHighlightStep[] | null => {
      if (result.mode === "workflow") return null;

      const resolved = resolveRouteHighlight(
        result,
        lookupRef.current.chambers,
        lookupRef.current.buildings,
        lookupRef.current.assignments,
      );
      if (!resolved?.steps.length) return null;

      stopWorkflowReplay();
      return resolved.steps;
    },
    [stopWorkflowReplay],
  );

  const activeRouteHighlight = useMemo((): RouteHighlightState => {
    if (workflowReplay?.isPlaying) {
      const current = workflowReplay.resolvedSteps[workflowReplay.currentIndex];
      if (!current) return null;
      return {
        steps: current.steps,
        connectionIds: current.connectionIds,
        fading: workflowReplay.fading,
        workflowStepCurrent: current.stepOrder,
        workflowStepTotal: current.stepTotal,
        workflowTargetNodeId: current.chamberId,
      };
    }
    if (executionProgress?.phase === "error" || executionProgress?.phase === "complete") {
      return null;
    }
    if (
      executionProgress &&
      (executionProgress.phase === "routing" || executionProgress.phase === "executing") &&
      routeHighlight
    ) {
      return {
        ...routeHighlight,
        signalActive: routeHighlight.signalActive ?? true,
        activeConnectionId:
          routeHighlight.activeConnectionId ?? executionProgress.connectionId,
      };
    }
    return routeHighlight;
  }, [workflowReplay, routeHighlight, executionProgress]);

  useEffect(
    () => () => {
      clearRouteTimers();
      clearWorkflowTimers();
      clearSignalTimers();
    },
    [clearRouteTimers, clearWorkflowTimers, clearSignalTimers],
  );

  return (
    <WorkspaceRouteContext.Provider
      value={{
        routeHighlight,
        activeRouteHighlight,
        workflowReplay,
        executionProgress,
        routeSourceEntityId,
        setRouteSourceEntityId,
        registerRouteLookup,
        beginExecutionProgress,
        markExecutionRouting,
        markExecutionRunning,
        tickExecutionActiveAgent,
        completeExecutionProgress,
        failExecutionProgress,
        clearExecutionProgress,
        applyChatRoute,
        startWorkflowReplay,
        clearRouteHighlight,
      }}
    >
      {children}
    </WorkspaceRouteContext.Provider>
  );
}

export function useWorkspaceRoute(): WorkspaceRouteContextValue {
  const ctx = useContext(WorkspaceRouteContext);
  if (!ctx) {
    throw new Error("useWorkspaceRoute must be used within WorkspaceRouteProvider");
  }
  return ctx;
}
