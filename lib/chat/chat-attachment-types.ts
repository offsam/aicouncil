import type { KnowledgeMediaKind } from "@/lib/knowledge/knowledge-media-types";
import { knowledgeKindFromMime } from "@/lib/knowledge/knowledge-media-types";
import { parseDataUrlMime } from "@/lib/knowledge/knowledge-library-utils";

export type ChatAttachment = {
  id: string;
  title: string;
  mimeType: string | null;
  kind: KnowledgeMediaKind;
  fileUrl: string | null;
  contentPreview: string | null;
};

export function chatAttachmentFromKnowledge(row: {
  id: string;
  title: string;
  content: string | null;
  file_url: string | null;
}): ChatAttachment {
  const mimeType = row.file_url ? parseDataUrlMime(row.file_url) : null;
  const kind = row.file_url ? knowledgeKindFromMime(mimeType) : "text";
  const contentPreview =
    row.content && !row.content.trim().startsWith("[Файл:") ? row.content.trim() : null;

  return {
    id: row.id,
    title: row.title,
    mimeType,
    kind,
    fileUrl: row.file_url,
    contentPreview,
  };
}
