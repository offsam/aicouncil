import type {
  CouncilExecutionPayload,
  ExecuteChatTaskResult,
  TeamExecutionPayload,
} from "@/lib/execute-chat-task";
import type { ExecutionMode } from "@/lib/execution-mode";
import {
  deriveExecutionResultFromChatTask,
  type ExecutionResultStatus,
} from "@/lib/workspace/execution-result-status";

export type ExecutionAgentStatus = "pending" | "working" | "done" | "error";

export type ExecutionAgentSlot = {
  agentId: string;
  slug: string;
  agentName: string;
  status: ExecutionAgentStatus;
  stepLabel?: string;
  answer?: string;
  error?: string;
  latencyMs?: number;
};

export type ExecutionProgressPhase = "routing" | "executing" | "complete" | "error";

export type ExecutionProgressState = {
  taskText: string;
  mode: ExecutionMode;
  phase: ExecutionProgressPhase;
  currentStepLabel?: string;
  agents: ExecutionAgentSlot[];
  activeAgentIndex: number;
  connectionId?: string;
  resultStatus?: ExecutionResultStatus;
};

export type RosterAgent = {
  id: string;
  slug: string;
  name: string;
};

export function buildExecutionAgentSlots(
  mode: ExecutionMode,
  roster: RosterAgent[],
  agentCount?: number,
): ExecutionAgentSlot[] {
  const count = roster.length > 0 ? roster.length : Math.max(agentCount ?? 1, 1);
  const picked =
    roster.length > 0
      ? roster.slice(0, count)
      : Array.from({ length: count }, (_, i) => ({
          id: `pending-${i}`,
          slug: `agent-${i + 1}`,
          name: `Agent ${i + 1}`,
        }));

  return picked.map((agent) => ({
    agentId: agent.id,
    slug: agent.slug,
    agentName: agent.name,
    status: "pending",
  }));
}

function applyTeamPayload(
  agents: ExecutionAgentSlot[],
  payload: TeamExecutionPayload | CouncilExecutionPayload,
  stepLabel: string,
): ExecutionAgentSlot[] {
  const byId = new Map(payload.agents.map((a) => [a.agentId, a]));
  return agents.map((slot) => {
    const hit = byId.get(slot.agentId);
    if (!hit) {
      return { ...slot, status: "pending", stepLabel };
    }
    return {
      ...slot,
      agentName: hit.agentName,
      slug: hit.slug,
      status: hit.status === "success" ? "done" : "error",
      stepLabel,
      answer: hit.answer,
      error: hit.error,
      latencyMs: hit.latencyMs,
    };
  });
}

export function finalizeExecutionProgress(
  progress: ExecutionProgressState,
  result: ExecuteChatTaskResult,
  stepLabel: string,
): ExecutionProgressState {
  if (result.mode === "workflow") {
    const failedStep = result.steps.find((s) => s.status === "failed");
    const completedBeforeFail = result.steps.filter((s) => s.status === "completed").length;
    const resultStatus = deriveExecutionResultFromChatTask(result);

    if (failedStep && completedBeforeFail === 0 && !result.answer) {
      return {
        ...progress,
        phase: "error",
        currentStepLabel: `Сбой на шаге ${failedStep.step_order}`,
        resultStatus,
      };
    }

    return {
      ...progress,
      phase: "complete",
      currentStepLabel: failedStep
        ? `Частично: сбой на шаге ${failedStep.step_order}`
        : stepLabel,
      resultStatus,
    };
  }

  let agents = progress.agents;

  if (result.fast?.agents.length) {
    agents = applyTeamPayload(agents, result.fast, stepLabel);
  } else
  if (result.team?.agents.length) {
    agents = applyTeamPayload(agents, result.team, stepLabel);
  } else if (result.council?.agents.length) {
    agents = applyTeamPayload(agents, result.council, stepLabel);
  } else if (result.agentId) {
    agents = agents.map((slot) =>
      slot.agentId === result.agentId || agents.length === 1
        ? {
            ...slot,
            agentName: result.agentName ?? slot.agentName,
            status: "done" as const,
            stepLabel,
            answer: result.answer,
          }
        : slot,
    );
    if (agents.every((a) => a.status === "pending") && agents[0]) {
      agents = [
        {
          ...agents[0],
          agentName: result.agentName ?? agents[0].agentName,
          status: "done",
          stepLabel,
          answer: result.answer,
        },
      ];
    }
  } else if (agents[0]) {
    agents = [
      {
        ...agents[0],
        status: "done",
        stepLabel,
        answer: result.answer,
      },
    ];
  }

  return {
    ...progress,
    phase: "complete",
    currentStepLabel: stepLabel,
    resultStatus: deriveExecutionResultFromChatTask(result),
    agents: agents.map((a) =>
      a.status === "pending" ? { ...a, status: "done", stepLabel, answer: result.answer } : a,
    ),
  };
}
