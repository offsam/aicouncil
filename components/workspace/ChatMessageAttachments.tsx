"use client";

import type { ChatAttachment } from "@/lib/chat/chat-attachment-types";
import { downloadKnowledgeEntry } from "@/lib/knowledge/knowledge-library-utils";

type ChatMessageAttachmentsProps = {
  attachments: ChatAttachment[];
};

function downloadAttachment(attachment: ChatAttachment) {
  downloadKnowledgeEntry({
    title: attachment.title,
    content: attachment.contentPreview,
    file_url: attachment.fileUrl,
  });
}

export function ChatMessageAttachments({ attachments }: ChatMessageAttachmentsProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="workspace-chat-attachments" data-testid="workspace-chat-attachments">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="workspace-chat-attachment">
          <div className="workspace-chat-attachment__head">
            <span className="workspace-chat-attachment__title">{attachment.title}</span>
            <button
              type="button"
              className="workspace-chat-attachment__download"
              onClick={() => downloadAttachment(attachment)}
            >
              Скачать
            </button>
          </div>

          {attachment.kind === "image" && attachment.fileUrl && (
            <img
              src={attachment.fileUrl}
              alt={attachment.title}
              className="workspace-chat-attachment__image"
            />
          )}

          {attachment.kind === "video" && attachment.fileUrl && (
            <video
              src={attachment.fileUrl}
              controls
              preload="metadata"
              className="workspace-chat-attachment__video"
            />
          )}

          {attachment.kind === "text" && attachment.contentPreview && (
            <pre className="workspace-chat-attachment__text">{attachment.contentPreview}</pre>
          )}

          {attachment.kind === "document" && attachment.fileUrl && (
            <iframe
              title={attachment.title}
              src={attachment.fileUrl}
              className="workspace-chat-attachment__iframe"
            />
          )}
        </div>
      ))}
    </div>
  );
}
