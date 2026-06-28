import type { KnowledgeEntry } from "@/lib/workspace/load-inspector-data";
import { decodeDataUrlText } from "@/lib/knowledge/decode-data-url";

export function parseDataUrlMime(dataUrl: string): string | null {
  const match = /^data:([^;,]+)/i.exec(dataUrl.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function guessFileExtension(mime: string | null, title: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/msword") return "doc";
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  const fromTitle = title.split(".").pop()?.toLowerCase();
  if (fromTitle && fromTitle.length <= 8) return fromTitle;
  if (mime === "text/markdown") return "md";
  if (mime?.startsWith("text/")) return "txt";
  return "bin";
}

export function guessDownloadFilename(entry: Pick<KnowledgeEntry, "title" | "content" | "file_url">): string {
  const placeholder = /^\[Файл:\s*([^,\]]+)/i.exec((entry.content ?? "").trim());
  if (placeholder?.[1]) {
    return placeholder[1].trim();
  }
  const mime = entry.file_url ? parseDataUrlMime(entry.file_url) : null;
  const ext = guessFileExtension(mime, entry.title);
  const base = entry.title.trim() || "document";
  if (base.toLowerCase().endsWith(`.${ext}`)) return base;
  return `${base}.${ext}`;
}

export function isPdfEntry(entry: Pick<KnowledgeEntry, "file_url">): boolean {
  if (!entry.file_url) return false;
  const mime = parseDataUrlMime(entry.file_url);
  return mime === "application/pdf" || /\.pdf($|\?)/i.test(entry.file_url);
}

/** Catalog description shown in lists and to agents. */
export function getKnowledgeEntryDescription(
  entry: Pick<KnowledgeEntry, "content" | "body" | "file_url">,
): string | null {
  const content = entry.content?.trim();
  if (!content) return null;
  return content;
}

/** True when entry has an attached file or extracted body (not description-only). */
export function entryHasAttachedFile(
  entry: Pick<KnowledgeEntry, "body" | "file_url">,
): boolean {
  return Boolean(entry.file_url || entry.body?.trim());
}

/** Text-only note saved without file attachment. */
export function entryIsTextNote(
  entry: Pick<KnowledgeEntry, "content" | "body" | "file_url">,
): boolean {
  return !entry.file_url && !entry.body?.trim() && Boolean(entry.content?.trim());
}

/** Description saved but file body never attached (broken upload). */
export function entryIsMissingFileAttachment(
  entry: Pick<KnowledgeEntry, "content" | "body" | "file_url">,
): boolean {
  return Boolean(entry.content?.trim()) && !entryHasAttachedFile(entry);
}

/** Full file text for preview and agents — not the catalog description alone. */
export function getKnowledgeEntryFileText(
  entry: Pick<KnowledgeEntry, "content" | "body" | "file_url">,
): string | null {
  if (entry.body?.trim()) return entry.body.trim();
  if (entry.file_url) {
    const decoded = decodeDataUrlText(entry.file_url)?.trim();
    if (decoded) return decoded;
  }
  if (entryIsTextNote(entry)) {
    return entry.content!.trim();
  }
  return null;
}

export function entryHasViewableBody(
  entry: Pick<KnowledgeEntry, "content" | "body" | "file_url">,
): boolean {
  return Boolean(getKnowledgeEntryFileText(entry) || entry.file_url);
}

export function entryHasDownloadableContent(
  entry: Pick<KnowledgeEntry, "content" | "body" | "file_url">,
): boolean {
  return entryHasAttachedFile(entry) || entryIsTextNote(entry);
}

export function downloadKnowledgeEntry(
  entry: Pick<KnowledgeEntry, "title" | "content" | "body" | "file_url">,
): void {
  if (entryIsMissingFileAttachment(entry)) {
    return;
  }

  const filename = guessDownloadFilename(entry);

  if (entry.file_url) {
    const anchor = document.createElement("a");
    anchor.href = entry.file_url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return;
  }

  const text = getKnowledgeEntryFileText(entry);
  if (!text) return;

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename.endsWith(".txt") ? filename : `${filename}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}
