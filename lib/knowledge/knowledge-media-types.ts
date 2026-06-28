export type KnowledgeMediaKind = "text" | "document" | "image" | "video" | "other";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "html",
  "xml",
  "yml",
  "yaml",
  "toml",
  "log",
]);

const DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]);

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

export const KNOWLEDGE_FILE_ACCEPT =
  ".txt,.md,.markdown,.json,.csv,.html,.xml,.yml,.yaml,.toml,.log,.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.mp4,.webm,.mov,.m4v";

export const MAX_TEXT_FILE_BYTES = 512_000;
export const MAX_DOCUMENT_FILE_BYTES = 256_000;
export const MAX_IMAGE_FILE_BYTES = 2_000_000;
export const MAX_VIDEO_FILE_BYTES = 5_000_000;

export function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function classifyKnowledgeFile(
  file: Pick<File, "name" | "type" | "size">,
): { kind: KnowledgeMediaKind; maxBytes: number } {
  const ext = fileExtension(file.name);

  if (
    TEXT_EXTENSIONS.has(ext) ||
    file.type.startsWith("text/") ||
    file.type === "application/json"
  ) {
    return { kind: "text", maxBytes: MAX_TEXT_FILE_BYTES };
  }

  if (DOCUMENT_EXTENSIONS.has(ext) || file.type === "application/pdf") {
    return { kind: "document", maxBytes: MAX_DOCUMENT_FILE_BYTES };
  }

  if (
    IMAGE_EXTENSIONS.has(ext) ||
    file.type.startsWith("image/")
  ) {
    return { kind: "image", maxBytes: MAX_IMAGE_FILE_BYTES };
  }

  if (
    VIDEO_EXTENSIONS.has(ext) ||
    file.type.startsWith("video/")
  ) {
    return { kind: "video", maxBytes: MAX_VIDEO_FILE_BYTES };
  }

  return { kind: "other", maxBytes: MAX_DOCUMENT_FILE_BYTES };
}

export function isExtractableDocumentFile(file: Pick<File, "name">): boolean {
  return DOCUMENT_EXTENSIONS.has(fileExtension(file.name));
}

export function isTextKnowledgeFile(file: Pick<File, "name" | "type" | "size">): boolean {
  return classifyKnowledgeFile(file).kind === "text";
}

export function knowledgeKindFromMime(mime: string | null): KnowledgeMediaKind {
  if (!mime) return "other";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  if (mime === "application/pdf" || mime.includes("word")) return "document";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

export function formatMaxFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
