import type { DebateRoundAction } from "./types";

export function buildInitialAuthorPrompt(question: string): string {
  return `Ты участник спора между двумя агентами. Дай развёрнутый начальный ответ на вопрос пользователя.

Вопрос:
${question.trim()}

Требования:
- Полный самодостаточный ответ (не черновик).
- Структурируй логично, без лишней воды.
- Верни ТОЛЬКО текст ответа, без JSON и без markdown-обёртки.`;
}

type ReviewPromptParams = {
  question: string;
  currentAnswer: string;
  role: "reviewer" | "author";
  revisionsRemainingSelf: number;
  revisionsRemainingOther: number;
  priorCriticalIssues: string[];
};

export function buildReviewPrompt(params: ReviewPromptParams): string {
  const issuesBlock =
    params.priorCriticalIssues.length > 0
      ? `\nПредыдущие критические замечания:\n${params.priorCriticalIssues.map((i, n) => `${n + 1}. ${i}`).join("\n")}\n`
      : "";

  const roleHint =
    params.role === "reviewer"
      ? "Ты рецензент. Прочитай версию автора."
      : "Ты автор исходного ответа. Прочитай правку рецензента и реши — принять или парировать.";

  const reviseRule =
    params.revisionsRemainingSelf <= 0
      ? "У тебя НЕ осталось попыток критической правки — можешь только подтвердить (verdict: confirm)."
      : `Осталось попыток критической правки: ${params.revisionsRemainingSelf} из 3.`;

  return `${roleHint}

Вопрос пользователя:
${params.question.trim()}

Текущая версия ответа:
${params.currentAnswer.trim()}
${issuesBlock}
${reviseRule}
У оппонента осталось попыток: ${params.revisionsRemainingOther} из 3.

Если версия приемлема — подтверди (verdict: confirm). Можешь добавить необязательные замечания в optionalNotes — они не блокируют закрытие спора.

Если есть критическая проблема — verdict: revise, объясни в criticalIssues и дай ПОЛНУЮ переписанную версию в answer (не патч, а цельный новый текст с учётом всего предыдущего).

Верни ТОЛЬКО валидный JSON без markdown:
{
  "verdict": "confirm" | "revise",
  "optionalNotes": "необязательные замечания при confirm",
  "criticalIssues": "почему не принято — только при revise",
  "answer": "полная версия при revise"
}`;
}

export function mapReviewAction(
  role: "reviewer" | "author",
  verdict: "confirm" | "revise",
): DebateRoundAction {
  if (verdict === "confirm") {
    return role === "author" ? "accept" : "confirm";
  }
  return role === "reviewer" ? "critical_revision" : "counter_revision";
}
