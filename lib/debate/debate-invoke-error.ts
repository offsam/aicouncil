/** User-facing message when debate invoke fails — no provider/model details. */
export const USER_DEBATE_INVOKE_FAILED_MESSAGE =
  "Не удалось завершить спор — один из агентов временно недоступен. Попробуйте позже или выберите другой уровень.";

/** Thrown after the debate session is closed with closed_reason = error. */
export class DebateInvokeFailedError extends Error {
  readonly debateId: string;
  readonly userMessage: string;

  constructor(debateId: string, userMessage: string = USER_DEBATE_INVOKE_FAILED_MESSAGE) {
    super(userMessage);
    this.name = "DebateInvokeFailedError";
    this.debateId = debateId;
    this.userMessage = userMessage;
  }
}
