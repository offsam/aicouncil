import { formatWorkspaceMayorConversationId } from "@/lib/mayor-conversation-memory";

/** localStorage key — stable Mayor thread token survives page reload (same pattern as chat history). */
export const WORKSPACE_MAYOR_CONVERSATION_TOKEN_KEY = "workspace-mayor-conversation-id-v1";

/**
 * Returns a stable workspace Mayor conversationId for this browser.
 * Token persists in localStorage; conversationId is `workspace:mayor:<token>`.
 */
export function getOrCreateWorkspaceMayorConversationId(): string {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateWorkspaceMayorConversationId is client-only");
  }

  try {
    const existing = localStorage.getItem(WORKSPACE_MAYOR_CONVERSATION_TOKEN_KEY);
    if (existing?.trim()) {
      return formatWorkspaceMayorConversationId(existing.trim());
    }
    const token = crypto.randomUUID();
    localStorage.setItem(WORKSPACE_MAYOR_CONVERSATION_TOKEN_KEY, token);
    return formatWorkspaceMayorConversationId(token);
  } catch {
    return formatWorkspaceMayorConversationId(crypto.randomUUID());
  }
}
