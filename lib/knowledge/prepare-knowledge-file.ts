import {
  classifyKnowledgeFile,
  formatMaxFileSize,
  isExtractableDocumentFile,
  isTextKnowledgeFile,
} from "./knowledge-media-types";

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

async function extractDocumentTextFromFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/knowledge/extract-text", {
    method: "POST",
    body: formData,
  });
  const body = (await res.json()) as { text?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? "Не удалось извлечь текст из документа");
  }
  return (body.text ?? "").trim();
}

export type PreparedKnowledgeUpload = {
  /** Short description for library catalog / search. */
  content: string;
  /** Full file text for agents when the entry is opened. */
  body: string | null;
  file_url: string | null;
};

function defaultCatalogDescription(file: File, fileText: string): string {
  const firstLine = fileText.split(/\r?\n/).find((line) => line.trim())?.trim();
  if (firstLine && firstLine.length <= 240) return firstLine;
  if (firstLine) return `${firstLine.slice(0, 240)}…`;
  return `[Файл: ${file.name}]`;
}

/**
 * Reads a library/chat file: description (content), full text (body), optional file_url.
 */
export async function prepareKnowledgeFileUpload(
  file: File,
  description = "",
): Promise<PreparedKnowledgeUpload> {
  const trimmedDescription = description.trim();
  const { kind, maxBytes } = classifyKnowledgeFile(file);

  if (file.size > maxBytes) {
    throw new Error(
      `Файл слишком большой (макс. ${formatMaxFileSize(maxBytes)} для ${kind}).`,
    );
  }

  const file_url = await readFileAsDataUrl(file);

  if (isTextKnowledgeFile(file)) {
    const fileText = (await file.text()).trim();
    return {
      content: trimmedDescription || defaultCatalogDescription(file, fileText),
      body: fileText || null,
      file_url,
    };
  }

  let body: string | null = null;
  if (isExtractableDocumentFile(file)) {
    const extracted = await extractDocumentTextFromFile(file);
    body = extracted || null;
  }

  const content =
    trimmedDescription ||
    (body ? defaultCatalogDescription(file, body) : `[Файл: ${file.name}, ${Math.round(file.size / 1024)} KB]`);

  return { content, body, file_url };
}

export { isTextKnowledgeFile, isExtractableDocumentFile } from "./knowledge-media-types";
export { KNOWLEDGE_FILE_ACCEPT } from "./knowledge-media-types";
