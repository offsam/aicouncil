import { extractDocumentText } from "@/lib/knowledge/extract-document-text";
import {
  classifyKnowledgeFile,
  formatMaxFileSize,
  isExtractableDocumentFile,
  isTextKnowledgeFile,
} from "@/lib/knowledge/knowledge-media-types";

function guessMimeType(fileName: string, reportedType: string): string {
  if (reportedType) return reportedType;
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "md" || ext === "markdown") return "text/markdown";
  if (ext === "txt") return "text/plain";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

function defaultCatalogDescription(fileName: string, fileText: string): string {
  const firstLine = fileText.split(/\r?\n/).find((line) => line.trim())?.trim();
  if (firstLine && firstLine.length <= 240) return firstLine;
  if (firstLine) return `${firstLine.slice(0, 240)}…`;
  return `[Файл: ${fileName}]`;
}

export type PreparedKnowledgeUploadServer = {
  content: string;
  body: string | null;
  file_url: string;
};

export async function prepareKnowledgeUploadFromFile(
  file: File,
  description = "",
): Promise<PreparedKnowledgeUploadServer> {
  const trimmedDescription = description.trim();
  const { kind, maxBytes } = classifyKnowledgeFile(file);

  if (file.size > maxBytes) {
    throw new Error(
      `Файл слишком большой (макс. ${formatMaxFileSize(maxBytes)} для ${kind}).`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = guessMimeType(file.name, file.type);
  const file_url = `data:${mime};base64,${buffer.toString("base64")}`;

  if (isTextKnowledgeFile(file)) {
    const fileText = buffer.toString("utf8").trim();
    if (!fileText && !trimmedDescription) {
      throw new Error("Файл пустой — нечего сохранить в библиотеку");
    }
    return {
      content: trimmedDescription || defaultCatalogDescription(file.name, fileText),
      body: fileText || null,
      file_url,
    };
  }

  let body: string | null = null;
  if (isExtractableDocumentFile(file)) {
    body = (await extractDocumentText(buffer, file.name)).trim() || null;
  }

  const content =
    trimmedDescription ||
    (body
      ? defaultCatalogDescription(file.name, body)
      : `[Файл: ${file.name}, ${Math.round(file.size / 1024)} KB]`);

  return { content, body, file_url };
}
