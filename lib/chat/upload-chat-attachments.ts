import { chatAttachmentFromKnowledge } from "@/lib/chat/chat-attachment-types";
import type { ChatAttachment } from "@/lib/chat/chat-attachment-types";
import { uploadKnowledgeFile } from "@/lib/knowledge/upload-knowledge-file-client";

async function resolveRegistryScope(registryId: string): Promise<{
  entityType: string;
  entityId: string;
}> {
  const res = await fetch(`/api/entity-registry/${registryId}`);
  const body = (await res.json()) as {
    entity?: { id: string; entity_type: string };
    error?: string;
  };
  if (!res.ok || !body.entity) {
    throw new Error(body.error ?? "Не удалось определить отдел для файла");
  }
  return {
    entityType: body.entity.entity_type,
    entityId: body.entity.id,
  };
}

export async function uploadChatAttachmentsToLibrary(params: {
  files: File[];
  registryId: string;
  comment?: string;
}): Promise<ChatAttachment[]> {
  const scope = await resolveRegistryScope(params.registryId);
  const attachments: ChatAttachment[] = [];

  for (const file of params.files) {
    const title = file.name.replace(/\.[^.]+$/, "") || file.name;
    const entry = await uploadKnowledgeFile({
      file,
      entityType: scope.entityType,
      entityId: scope.entityId,
      title,
      description: params.comment?.trim() || undefined,
    });

    attachments.push(chatAttachmentFromKnowledge(entry));
  }

  return attachments;
}
