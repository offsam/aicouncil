"use client";

import { useRef, useState } from "react";
import type { KnowledgeEntry } from "@/lib/workspace/load-inspector-data";
import {
  downloadKnowledgeEntry,
  entryHasAttachedFile,
  entryHasDownloadableContent,
  entryIsMissingFileAttachment,
  entryIsTextNote,
  getKnowledgeEntryDescription,
  getKnowledgeEntryFileText,
  isPdfEntry,
  parseDataUrlMime,
} from "@/lib/knowledge/knowledge-library-utils";
import { KNOWLEDGE_FILE_ACCEPT } from "@/lib/knowledge/prepare-knowledge-file";
import { knowledgeKindFromMime } from "@/lib/knowledge/knowledge-media-types";

type KnowledgeLibraryBrowseProps = {
  entries: KnowledgeEntry[];
  emptyHint?: string;
  readOnly?: boolean;
  onDelete?: (entryId: string) => void | Promise<void>;
  onAttachFile?: (entryId: string, file: File) => void | Promise<void>;
  attaching?: boolean;
  deleting?: boolean;
};

function formatEntryDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function entryKindLabel(entry: KnowledgeEntry): string {
  if (entryIsMissingFileAttachment(entry)) return "Без файла";
  if (entryIsTextNote(entry)) return "Заметка";
  const kind = knowledgeKindFromMime(
    entry.file_url ? parseDataUrlMime(entry.file_url) : null,
  );
  if (kind === "text") {
    const ext = entry.title.split(".").pop()?.toLowerCase();
    if (ext === "md" || ext === "markdown") return "Markdown";
    return "Текст";
  }
  if (kind === "image") return "Фото";
  if (kind === "video") return "Видео";
  if (kind === "document") return isPdfEntry(entry) ? "PDF" : "Документ";
  return "Файл";
}

function KnowledgeLibraryEntryViewer({
  entry,
  onBack,
  onAttachFile,
  attaching = false,
}: {
  entry: KnowledgeEntry;
  onBack: () => void;
  onAttachFile?: (entryId: string, file: File) => void | Promise<void>;
  attaching?: boolean;
}) {
  const attachInputRef = useRef<HTMLInputElement>(null);
  const hasFile = Boolean(entry.file_url);
  const description = getKnowledgeEntryDescription(entry);
  const fileText = getKnowledgeEntryFileText(entry);
  const missingFile = entryIsMissingFileAttachment(entry);
  const isTextNote = entryIsTextNote(entry);
  const fileKind = entry.file_url ? knowledgeKindFromMime(parseDataUrlMime(entry.file_url)) : null;
  const isPdf = isPdfEntry(entry);
  const isTextLike = fileKind === "text" || Boolean(fileText && hasFile && !isPdf);
  const canDownload = entryHasDownloadableContent(entry);

  return (
    <div className="workspace-library-viewer" data-testid="workspace-library-viewer">
      <div className="workspace-library-viewer__toolbar">
        <button
          type="button"
          onClick={onBack}
          className="workspace-bubble-btn workspace-bubble-btn--ghost"
          data-testid="workspace-library-viewer-back"
        >
          ← К списку
        </button>
        {canDownload && (
          <button
            type="button"
            onClick={() => downloadKnowledgeEntry(entry)}
            className="workspace-bubble-btn workspace-bubble-btn--primary"
            data-testid="workspace-library-viewer-download"
          >
            Скачать
          </button>
        )}
      </div>

      <div className="workspace-library-viewer__meta">
        <h4 className="workspace-library-viewer__title">{entry.title}</h4>
        {entry.created_at && (
          <p className="workspace-library-viewer__date">{formatEntryDate(entry.created_at)}</p>
        )}
        <span className="workspace-bubble-chip">{entryKindLabel(entry)}</span>
      </div>

      {missingFile && (
        <div
          className="workspace-library-viewer__notice workspace-inspector-card"
          data-testid="workspace-library-missing-file"
        >
          <p className="text-xs leading-relaxed text-[var(--ws-text-secondary)]">
            Файл не прикреплён — сохранены только название и описание. Прикрепите файл, чтобы
            открыть и скачать содержимое.
          </p>
          {onAttachFile && (
            <>
              <button
                type="button"
                disabled={attaching}
                onClick={() => attachInputRef.current?.click()}
                className="workspace-bubble-btn workspace-bubble-btn--primary mt-2"
                data-testid="workspace-library-attach-file"
              >
                {attaching ? "…" : "Прикрепить файл"}
              </button>
              <input
                ref={attachInputRef}
                type="file"
                accept={KNOWLEDGE_FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onAttachFile(entry.id, file);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      )}

      {description && (
        <div className="workspace-inspector-card mt-3">
          <div className="workspace-inspector-label mb-1">Описание</div>
          <pre className="workspace-library-viewer__content">{description}</pre>
        </div>
      )}

      {hasFile && fileKind === "image" && (
        <img
          src={entry.file_url ?? undefined}
          alt={entry.title}
          className="workspace-library-viewer__image"
        />
      )}

      {hasFile && fileKind === "video" && (
        <video
          src={entry.file_url ?? undefined}
          controls
          preload="metadata"
          className="workspace-library-viewer__video"
        />
      )}

      {hasFile && fileKind === "document" && isPdf && (
        <iframe
          title={entry.title}
          src={entry.file_url ?? undefined}
          className="workspace-library-viewer__iframe"
          data-testid="workspace-library-viewer-pdf"
        />
      )}

      {hasFile && fileKind === "document" && !isPdf && fileText && (
        <div className="workspace-inspector-card mt-3">
          <div className="workspace-inspector-label mb-1">Извлечённый текст документа</div>
          <pre
            className="workspace-library-viewer__content"
            data-testid="workspace-library-viewer-content"
          >
            {fileText}
          </pre>
        </div>
      )}

      {hasFile && fileKind === "document" && !isPdf && !fileText && (
        <div className="workspace-library-viewer__notice workspace-inspector-card">
          Текст из документа не извлечён. Скачайте файл, чтобы открыть его локально.
        </div>
      )}

      {hasFile && isTextLike && fileText && (
        <div className="workspace-inspector-card mt-3">
          <div className="workspace-inspector-label mb-1">Содержимое файла</div>
          <pre
            className="workspace-library-viewer__content workspace-library-viewer__content--file"
            data-testid="workspace-library-viewer-content"
          >
            {fileText}
          </pre>
        </div>
      )}

      {isTextNote && fileText && (
        <div className="workspace-inspector-card mt-3">
          <div className="workspace-inspector-label mb-1">Текст заметки</div>
          <pre
            className="workspace-library-viewer__content"
            data-testid="workspace-library-viewer-content"
          >
            {fileText}
          </pre>
        </div>
      )}

      {!hasFile && !description && !fileText && !missingFile && (
        <p className="workspace-inspector-hint">В записи нет содержимого для просмотра.</p>
      )}
    </div>
  );
}

export function KnowledgeLibraryBrowse({
  entries,
  emptyHint = "Файлов пока нет.",
  readOnly = false,
  onDelete,
  onAttachFile,
  attaching = false,
  deleting = false,
}: KnowledgeLibraryBrowseProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;

  if (selectedEntry) {
    return (
      <KnowledgeLibraryEntryViewer
        entry={selectedEntry}
        onBack={() => setSelectedEntryId(null)}
        onAttachFile={readOnly ? undefined : onAttachFile}
        attaching={attaching}
      />
    );
  }

  if (entries.length === 0) {
    return <p className="workspace-inspector-hint">{emptyHint}</p>;
  }

  return (
    <ul className="workspace-library-list" data-testid="workspace-library-list">
      {entries.map((entry) => (
        <li key={entry.id} className="workspace-library-list__item workspace-inspector-card">
          <button
            type="button"
            className="workspace-library-list__open"
            onClick={() => setSelectedEntryId(entry.id)}
            data-testid={`workspace-library-open-${entry.id}`}
          >
            <span className="workspace-library-list__title">{entry.title}</span>
            <span className="workspace-library-list__meta">
              <span className="workspace-bubble-chip">{entryKindLabel(entry)}</span>
              {entry.created_at && (
                <span className="workspace-library-list__date">
                  {formatEntryDate(entry.created_at)}
                </span>
              )}
            </span>
            {getKnowledgeEntryDescription(entry) && (
              <span className="workspace-library-list__preview">
                {getKnowledgeEntryDescription(entry)}
              </span>
            )}
            {entryHasAttachedFile(entry) && (
              <span className="workspace-library-list__preview workspace-library-list__preview--muted">
                Файл загружен · {(entry.body?.trim().length ?? 0).toLocaleString()} симв.
              </span>
            )}
            {entryIsMissingFileAttachment(entry) && (
              <span className="workspace-library-list__preview text-amber-400/90">
                Файл не прикреплён — только описание
              </span>
            )}
            {entry.file_url && !entry.body?.trim() && (
              <span className="workspace-library-list__preview workspace-library-list__preview--muted">
                Файл прикреплён · откройте для просмотра
              </span>
            )}
          </button>

          <div className="workspace-library-list__actions">
            <button
              type="button"
              className="workspace-library-list__link"
              onClick={() => setSelectedEntryId(entry.id)}
              data-testid={`workspace-library-open-inline-${entry.id}`}
            >
              Открыть
            </button>
            {entryHasDownloadableContent(entry) && (
              <button
                type="button"
                className="workspace-library-list__link"
                onClick={() => downloadKnowledgeEntry(entry)}
                data-testid={`workspace-library-download-${entry.id}`}
              >
                Скачать
              </button>
            )}
            {!readOnly && onDelete && (
              <button
                type="button"
                disabled={deleting}
                onClick={() => void onDelete(entry.id)}
                className="workspace-library-list__delete"
              >
                Удалить
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
