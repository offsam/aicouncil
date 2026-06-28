import type { CouncilExecutionPayload, TeamExecutionPayload } from "@/lib/execute-chat-task";
import type { ChatAttachment } from "@/lib/chat/chat-attachment-types";
import type { DebateRoundSummary } from "@/lib/debate/types";
import type { ExecutionResultStatus } from "@/lib/workspace/execution-result-status";
import type { WorkspaceChatTarget } from "@/lib/workspace/workspace-chat-target";

const STORAGE_PREFIX = "workspace-chat-history-v1";
const MAX_MESSAGES = 80;

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: string;
  governmentFallback?: boolean;
  techEscalation?: boolean;
  fast?: TeamExecutionPayload;
  team?: TeamExecutionPayload;
  council?: CouncilExecutionPayload;
  executionStatus?: ExecutionResultStatus;
  isError?: boolean;
  createdAt: string;
  debate?: {
    debateId: string;
    closedReason: "confirmed" | "attempts_exhausted";
    authorName: string;
    reviewerName: string;
    rounds: DebateRoundSummary[];
  };
  attachments?: ChatAttachment[];
};

function storageKey(target: WorkspaceChatTarget): string {
  switch (target.kind) {
    case "mayor":
      return `${STORAGE_PREFIX}:mayor`;
    case "chamber":
      return `${STORAGE_PREFIX}:chamber:${target.registryId}`;
    case "agent":
      return `${STORAGE_PREFIX}:agent:${target.agentId}`;
  }
}

function parseMessages(raw: unknown): StoredChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<StoredChatMessage>;
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (typeof row.text !== "string" || typeof row.id !== "string") continue;
    out.push({
      id: row.id,
      role: row.role,
      text: row.text,
      meta: typeof row.meta === "string" ? row.meta : undefined,
      governmentFallback: row.governmentFallback === true,
      techEscalation: row.techEscalation === true,
      fast: row.fast,
      team: row.team,
      council: row.council,
      executionStatus: row.executionStatus,
      isError: row.isError === true,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
      debate: row.debate,
      attachments: Array.isArray(row.attachments) ? row.attachments : undefined,
    });
  }
  return out.slice(-MAX_MESSAGES);
}

export function loadWorkspaceChatHistory(target: WorkspaceChatTarget): StoredChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(target));
    if (!raw) return [];
    return parseMessages(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveWorkspaceChatHistory(
  target: WorkspaceChatTarget,
  messages: StoredChatMessage[],
): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(storageKey(target), JSON.stringify(trimmed));
  } catch {
    /* quota / private mode */
  }
}

export { workspaceChatTargetKey } from "@/lib/workspace/workspace-chat-target";

export function toStoredChatMessage(
  message: Omit<StoredChatMessage, "createdAt"> & { createdAt?: string },
): StoredChatMessage {
  return {
    ...message,
    createdAt: message.createdAt ?? new Date().toISOString(),
  };
}
