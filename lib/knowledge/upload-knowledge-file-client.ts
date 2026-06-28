export type KnowledgeUploadEntry = {
  id: string;
  title: string;
  content: string | null;
  body?: string | null;
  file_url: string | null;
};

export type KnowledgeFileUploadParams = {
  file: File;
  entityType: string;
  entityId: string;
  title: string;
  description?: string;
};

function assertEntryHasFilePayload(entry: KnowledgeUploadEntry): void {
  if (entry.file_url || entry.body?.trim()) return;
  throw new Error(
    "Файл сохранился без содержимого — проверьте формат и размер (TXT/MD до 512 KB, PDF/DOC до 256 KB).",
  );
}

export async function uploadKnowledgeFile(
  params: KnowledgeFileUploadParams,
): Promise<KnowledgeUploadEntry> {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("entity_type", params.entityType);
  formData.append("entity_id", params.entityId);
  formData.append("title", params.title);
  if (params.description?.trim()) {
    formData.append("description", params.description.trim());
  }

  const res = await fetch("/api/knowledge/upload", {
    method: "POST",
    body: formData,
  });
  const responseBody = (await res.json()) as { entry?: KnowledgeUploadEntry; error?: string };
  if (!res.ok || !responseBody.entry) {
    throw new Error(responseBody.error ?? "Не удалось загрузить файл");
  }

  assertEntryHasFilePayload(responseBody.entry);
  return responseBody.entry;
}

export async function attachKnowledgeFile(
  entryId: string,
  file: File,
  description?: string,
): Promise<KnowledgeUploadEntry> {
  const formData = new FormData();
  formData.append("file", file);
  if (description?.trim()) {
    formData.append("description", description.trim());
  }

  const res = await fetch(`/api/knowledge/${entryId}/upload`, {
    method: "POST",
    body: formData,
  });
  const responseBody = (await res.json()) as { entry?: KnowledgeUploadEntry; error?: string };
  if (!res.ok || !responseBody.entry) {
    throw new Error(responseBody.error ?? "Не удалось прикрепить файл");
  }

  assertEntryHasFilePayload(responseBody.entry);
  return responseBody.entry;
}
