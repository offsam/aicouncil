import type { ExecuteChatTaskResult } from "@/lib/execute-chat-task";
import { resolveAppBaseUrl } from "./app-base-url";

export type MayorChatRequest = {
  taskText: string;
  targetAgentId: string;
  directTargetEntityId: string;
};

export async function postMayorChatViaApi(
  payload: MayorChatRequest,
): Promise<ExecuteChatTaskResult> {
  const base = resolveAppBaseUrl();
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: payload.taskText,
      targetAgentId: payload.targetAgentId,
      directTargetEntityId: payload.directTargetEntityId,
      executionMode: "fast",
    }),
  });

  const data = (await res.json()) as ExecuteChatTaskResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `POST /api/chat failed (${res.status})`);
  }
  return data;
}

export function extractChatAnswer(result: ExecuteChatTaskResult): string {
  if (result.mode === "workflow") {
    return result.answer?.trim() || "(workflow завершён без текста ответа)";
  }
  return result.answer?.trim() || "";
}
