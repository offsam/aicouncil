import type {
  ChatWorkflowStep,
  CouncilExecutionPayload,
  ExecuteChatTaskResult,
  TeamAgentAnswer,
  TeamExecutionPayload,
} from "@/lib/execute-chat-task";
import type { ExecutionProgressState } from "@/lib/workspace/execution-progress";

export type ExecutionResultKind =
  | "full_success"
  | "partial_success"
  | "workflow_step_failed"
  | "full_failure";

export type ExecutionFailedItem = {
  label: string;
  error?: string;
};

export type ExecutionResultStatus = {
  kind: ExecutionResultKind;
  title: string;
  detail?: string;
  successCount?: number;
  totalCount?: number;
  failedItems?: ExecutionFailedItem[];
  hasAnswer?: boolean;
  workflowFailedStep?: {
    order: number;
    label: string;
    error?: string;
  };
  achievedSteps?: Array<{ order: number; label: string }>;
};

const TITLES: Record<ExecutionResultKind, string> = {
  full_success: "Успех 100%",
  partial_success: "Частичный успех",
  workflow_step_failed: "На этом шаге произошёл сбой",
  full_failure: "Сбой",
};

function failedAgents(agents: TeamAgentAnswer[]): ExecutionFailedItem[] {
  return agents
    .filter((a) => a.status === "error")
    .map((a) => ({
      label: a.agentName,
      error: a.error,
    }));
}

export function deriveAgentPayloadExecutionResult(
  payload: TeamExecutionPayload | CouncilExecutionPayload,
  modeLabel: string,
): ExecutionResultStatus {
  const { partial, successCount, invokedCount, agents } = payload;
  const failed = failedAgents(agents);

  if (successCount === 0) {
    return {
      kind: "full_failure",
      title: TITLES.full_failure,
      detail: `Ни один эксперт ${modeLabel} не смог ответить.`,
      successCount: 0,
      totalCount: invokedCount,
      failedItems: failed,
      hasAnswer: false,
    };
  }

  if (partial) {
    return {
      kind: "partial_success",
      title: TITLES.partial_success,
      detail: `${successCount} из ${invokedCount} экспертов ответили успешно.`,
      successCount,
      totalCount: invokedCount,
      failedItems: failed,
      hasAnswer: true,
    };
  }

  return {
    kind: "full_success",
    title: TITLES.full_success,
    detail: `Все ${successCount} экспертов ответили успешно.`,
    successCount,
    totalCount: invokedCount,
    hasAnswer: true,
  };
}

function stepLabel(step: ChatWorkflowStep): string {
  return step.target_chamber?.name ?? `Шаг ${step.step_order}`;
}

type WorkflowStepForStatus = ChatWorkflowStep & { error_message?: string | null };

export function deriveWorkflowExecutionResult(
  workflowStatus: string,
  steps: WorkflowStepForStatus[],
  answer: string | null,
): ExecutionResultStatus {
  const failedStep = steps.find((s) => s.status === "failed");
  const completedSteps = steps.filter((s) => s.status === "completed");
  const achievedSteps = completedSteps.map((s) => ({
    order: s.step_order,
    label: stepLabel(s),
  }));

  if (workflowStatus === "completed" && !failedStep) {
    return {
      kind: "full_success",
      title: TITLES.full_success,
      detail: `Workflow завершён: ${completedSteps.length} из ${steps.length} шагов.`,
      successCount: completedSteps.length,
      totalCount: steps.length,
      hasAnswer: Boolean(answer),
    };
  }

  if (failedStep) {
    const failedLabel = stepLabel(failedStep);
    const hasPartialOutput = achievedSteps.length > 0 || Boolean(answer);

    if (hasPartialOutput) {
      return {
        kind: "workflow_step_failed",
        title: TITLES.workflow_step_failed,
        detail: `Шаг ${failedStep.step_order} «${failedLabel}» не выполнен. Достигнуто до сбоя: ${achievedSteps.length} шаг(ов).`,
        successCount: achievedSteps.length,
        totalCount: steps.length,
        hasAnswer: Boolean(answer),
        workflowFailedStep: {
          order: failedStep.step_order,
          label: failedLabel,
          error: failedStep.error_message ?? failedStep.output_summary ?? undefined,
        },
        achievedSteps,
      };
    }

    return {
      kind: "full_failure",
      title: TITLES.full_failure,
      detail: `Workflow остановлен на шаге ${failedStep.step_order} «${failedLabel}».`,
      successCount: 0,
      totalCount: steps.length,
      hasAnswer: false,
      workflowFailedStep: {
        order: failedStep.step_order,
        label: failedLabel,
      },
    };
  }

  if (workflowStatus === "failed") {
    return {
      kind: "full_failure",
      title: TITLES.full_failure,
      detail: "Workflow завершился с ошибкой.",
      hasAnswer: Boolean(answer),
    };
  }

  return {
    kind: "full_success",
    title: TITLES.full_success,
    detail: "Workflow выполняется или завершён.",
    hasAnswer: Boolean(answer),
  };
}

export function deriveExecutionResultFromChatTask(
  result: ExecuteChatTaskResult,
): ExecutionResultStatus {
  if (result.mode === "workflow") {
    return deriveWorkflowExecutionResult(result.status, result.steps, result.answer);
  }

  if (result.fast) {
    return deriveAgentPayloadExecutionResult(result.fast, "Fast");
  }

  if (result.team) {
    return deriveAgentPayloadExecutionResult(result.team, "Team");
  }

  if (result.council) {
    return deriveAgentPayloadExecutionResult(result.council, "Council");
  }

  return {
    kind: "full_success",
    title: TITLES.full_success,
    detail: "Ответ получен.",
    successCount: 1,
    totalCount: 1,
    hasAnswer: Boolean(result.answer),
  };
}

export function deriveExecutionResultFromProgress(
  progress: ExecutionProgressState,
): ExecutionResultStatus | null {
  if (progress.phase !== "complete" && progress.phase !== "error") {
    return null;
  }

  if (progress.phase === "error") {
    return {
      kind: "full_failure",
      title: TITLES.full_failure,
      detail: progress.currentStepLabel ?? "Выполнение прервано с ошибкой.",
      hasAnswer: false,
      failedItems: progress.agents
        .filter((a) => a.status === "error")
        .map((a) => ({
          label: a.agentName,
          error: a.error ?? progress.currentStepLabel,
        })),
    };
  }

  const done = progress.agents.filter((a) => a.status === "done");
  const errors = progress.agents.filter((a) => a.status === "error");
  const total = progress.agents.length;

  if (total === 0) {
    return {
      kind: "full_success",
      title: TITLES.full_success,
      detail: progress.currentStepLabel ?? "Готово.",
      hasAnswer: true,
    };
  }

  if (errors.length === total) {
    return {
      kind: "full_failure",
      title: TITLES.full_failure,
      detail: "Ни один агент не смог ответить.",
      successCount: 0,
      totalCount: total,
      failedItems: errors.map((a) => ({
        label: a.agentName,
        error: a.error,
      })),
      hasAnswer: false,
    };
  }

  if (errors.length > 0) {
    return {
      kind: "partial_success",
      title: TITLES.partial_success,
      detail: `${done.length} из ${total} агентов ответили успешно.`,
      successCount: done.length,
      totalCount: total,
      failedItems: errors.map((a) => ({
        label: a.agentName,
        error: a.error,
      })),
      hasAnswer: done.some((a) => Boolean(a.answer)),
    };
  }

  return {
    kind: "full_success",
    title: TITLES.full_success,
    detail:
      total > 1
        ? `Все ${done.length} агентов ответили успешно.`
        : (progress.currentStepLabel ?? "Ответ получен."),
    successCount: done.length,
    totalCount: total,
    hasAnswer: done.some((a) => Boolean(a.answer)),
  };
}

export function executionResultTestId(kind: ExecutionResultKind): string {
  return `execution-result-${kind.replace(/_/g, "-")}`;
}

export function isTaskProblemStatus(status: ExecutionResultStatus): boolean {
  return status.kind !== "full_success";
}
