import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  chatAttachmentFromKnowledge,
  type ChatAttachment,
} from "./chat-attachment-types";

const SHARE_FILE_PATTERN =
  /(?:отправ|пришл|скин|перешл|дай|запроси|покаж|найди|достань|передай).{0,24}(?:файл|документ|вложен|фото|видео|материал)/i;

export function userRequestedSharedFiles(taskText: string): boolean {
  return SHARE_FILE_PATTERN.test(taskText.trim());
}

export async function fetchChatAttachmentsByIds(ids: string[]): Promise<ChatAttachment[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("knowledge")
    .select("id, title, content, file_url")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map(chatAttachmentFromKnowledge);
}

export function buildAttachmentContextForPrompt(attachments: ChatAttachment[]): string {
  if (attachments.length === 0) return "";
  const lines = attachments.map((attachment, index) => {
    const parts = [`${index + 1}. ${attachment.title} (id=${attachment.id}, kind=${attachment.kind})`];
    if (attachment.contentPreview) {
      parts.push(`   content: ${attachment.contentPreview.slice(0, 1200)}`);
    }
    if (attachment.fileUrl) {
      parts.push(`   file: attached (${attachment.mimeType ?? "binary"})`);
    }
    return parts.join("\n");
  });
  return `[User attachments in library — already saved]\n${lines.join("\n")}`;
}

export async function resolveChatResponseAttachments(params: {
  taskText: string;
  executionRegistryId: string;
  uploadedAttachmentIds?: string[];
}): Promise<ChatAttachment[]> {
  const uploaded = await fetchChatAttachmentsByIds(params.uploadedAttachmentIds ?? []);
  const shareRequested = userRequestedSharedFiles(params.taskText);

  if (!shareRequested && uploaded.length === 0) {
    return [];
  }

  if (shareRequested) {
    const supabase = getSupabaseAdmin();
    const { data: rows } = await supabase
      .from("knowledge")
      .select("id, title, content, file_url")
      .eq("entity_registry_id", params.executionRegistryId)
      .order("created_at", { ascending: false })
      .limit(20);

    const normalizedTask = params.taskText.toLowerCase();
    const matched =
      (rows ?? []).filter((row) => {
        const title = row.title.toLowerCase();
        return normalizedTask.includes(title) || title.length >= 4 && normalizedTask.includes(title.slice(0, Math.min(title.length, 12)));
      }) ?? [];

    const pool = matched.length > 0 ? matched : (rows ?? []).filter((row) => row.file_url || (row.content && !row.content.startsWith("[Файл:")));
    const shared = pool.slice(0, 5).map(chatAttachmentFromKnowledge);
    const byId = new Map<string, ChatAttachment>();
    for (const attachment of [...uploaded, ...shared]) {
      byId.set(attachment.id, attachment);
    }
    return [...byId.values()];
  }

  return uploaded;
}

export async function copyKnowledgeEntryToEntity(params: {
  knowledgeId: string;
  entityType: string;
  entityId: string;
  entityRegistryId: string;
}): Promise<ChatAttachment> {
  const supabase = getSupabaseAdmin();
  const { data: source, error: sourceError } = await supabase
    .from("knowledge")
    .select("title, content, file_url, object_id")
    .eq("id", params.knowledgeId)
    .maybeSingle();
  if (sourceError || !source) {
    throw new Error(sourceError?.message ?? "Knowledge entry not found");
  }

  const { data: copy, error: copyError } = await supabase
    .from("knowledge")
    .insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      entity_registry_id: params.entityRegistryId,
      title: source.title,
      content: source.content,
      file_url: source.file_url,
      object_id: source.object_id,
    })
    .select("id, title, content, file_url")
    .single();

  if (copyError || !copy) {
    throw new Error(copyError?.message ?? "Failed to copy knowledge entry");
  }

  return chatAttachmentFromKnowledge(copy);
}
