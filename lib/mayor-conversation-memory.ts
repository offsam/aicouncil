import { getSupabaseAdmin } from "./supabase/admin";

/** Max stored turns (user + assistant pairs); oldest trimmed after insert. */
export const MAYOR_CONVERSATION_MAX_MESSAGES = 40;

export type MayorConversationMessageKind = "answer" | "clarify";

export type MayorConversationMessage = {
  role: "user" | "assistant";
  content: string;
  kind: MayorConversationMessageKind;
};

export type MayorConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

function normalizeConversationId(conversationId: string): string {
  const id = conversationId.trim();
  if (!id) throw new Error("conversationId is required");
  if (id.length > 256) throw new Error("conversationId too long");
  return id;
}

/** Telegram private/group chat scope — never mix with web or other chats. */
export function formatTelegramMayorConversationId(chatId: number | string): string {
  return `telegram:${String(chatId)}`;
}

export async function loadMayorConversationHistory(
  conversationId: string,
  limit = MAYOR_CONVERSATION_MAX_MESSAGES,
): Promise<MayorConversationMessage[]> {
  const supabase = getSupabaseAdmin();
  const scoped = normalizeConversationId(conversationId);
  const { data, error } = await supabase
    .from("mayor_conversation_messages")
    .select("role, content, kind, created_at")
    .eq("conversation_id", scoped)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[mayor-conversation-memory] load failed:", error.message);
    return [];
  }

  return (data ?? [])
    .slice()
    .reverse()
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: String(row.content),
      kind: (row.kind === "clarify" ? "clarify" : "answer") as MayorConversationMessageKind,
    }));
}

/** True when Mayor may ask a clarifying question (one round per thread). */
export function mayorClarifyAllowed(history: MayorConversationMessage[]): boolean {
  if (history.length === 0) return true;
  const last = history[history.length - 1];
  return !(last.role === "assistant" && last.kind === "clarify");
}

export function mayorConversationTurnsForModel(
  history: MayorConversationMessage[],
): MayorConversationTurn[] {
  return history.map(({ role, content }) => ({ role, content }));
}

export async function appendMayorConversationTurn(
  conversationId: string,
  userContent: string,
  assistantContent: string,
  assistantKind: MayorConversationMessageKind = "answer",
): Promise<void> {
  const user = userContent.trim();
  const assistant = assistantContent.trim();
  if (!user || !assistant) return;

  const supabase = getSupabaseAdmin();
  const scoped = normalizeConversationId(conversationId);

  const { error: userError } = await supabase.from("mayor_conversation_messages").insert({
    conversation_id: scoped,
    role: "user",
    content: user,
    kind: "answer",
  });
  if (userError) {
    console.warn("[mayor-conversation-memory] append user failed:", userError.message);
    return;
  }

  const { error: assistantError } = await supabase.from("mayor_conversation_messages").insert({
    conversation_id: scoped,
    role: "assistant",
    content: assistant,
    kind: assistantKind,
  });

  if (assistantError) {
    console.warn("[mayor-conversation-memory] append assistant failed:", assistantError.message);
    return;
  }

  const { count, error: countError } = await supabase
    .from("mayor_conversation_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", scoped);

  if (countError || count == null || count <= MAYOR_CONVERSATION_MAX_MESSAGES) {
    return;
  }

  const excess = count - MAYOR_CONVERSATION_MAX_MESSAGES;
  const { data: staleRows } = await supabase
    .from("mayor_conversation_messages")
    .select("id")
    .eq("conversation_id", scoped)
    .order("created_at", { ascending: true })
    .limit(excess);

  const staleIds = (staleRows ?? []).map((row) => row.id);
  if (staleIds.length === 0) return;

  await supabase.from("mayor_conversation_messages").delete().in("id", staleIds);
}
