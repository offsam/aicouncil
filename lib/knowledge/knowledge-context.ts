import type { KnowledgeRef } from "../office-types";
import {
  getEffectiveKnowledgeBody,
  getKnowledgeCatalogDescription,
  shouldOpenKnowledgeBody,
  type KnowledgeRowLike,
} from "./knowledge-entry";

export const KNOWLEDGE_LAYER_CHAR_LIMIT = 40_000;

type KnowledgeRow = KnowledgeRowLike & { id: string };

export type BuildKnowledgeRefsOptions = {
  taskText?: string;
};

/**
 * Builds knowledge refs: catalog metadata for every entry; full body only when opened for this task.
 */
export function buildKnowledgeRefsFromRows(
  rows: KnowledgeRow[],
  options?: BuildKnowledgeRefsOptions,
): KnowledgeRef[] {
  const refs: KnowledgeRef[] = [];
  let catalogChars = 0;
  let bodyChars = 0;
  let omittedCount = 0;

  for (const row of rows) {
    const description = getKnowledgeCatalogDescription(row);
    const fullBody = getEffectiveKnowledgeBody(row);
    const opened = shouldOpenKnowledgeBody(options?.taskText, row);
    const catalogLine = `- [${row.id}] ${row.title}${description ? `: ${description}` : ""} | ${
      opened ? "OPENED" : "catalog only"
    }`;

    if (catalogChars + catalogLine.length > KNOWLEDGE_LAYER_CHAR_LIMIT) {
      omittedCount += 1;
      continue;
    }
    catalogChars += catalogLine.length;

    let bodyForPrompt: string | null = null;
    if (opened && fullBody) {
      if (bodyChars + fullBody.length > KNOWLEDGE_LAYER_CHAR_LIMIT) {
        bodyForPrompt = null;
      } else {
        bodyForPrompt = fullBody;
        bodyChars += fullBody.length;
      }
    }

    refs.push({
      id: row.id,
      title: row.title,
      content: description,
      body: bodyForPrompt,
      fileUrl: row.file_url || null,
      opened,
    });
  }

  if (omittedCount > 0) {
    refs.push({
      id: "knowledge-truncated-notice",
      title: `[+ ещё ${omittedCount} записей знаний, не показаны — лимит ${KNOWLEDGE_LAYER_CHAR_LIMIT} символов на слой]`,
      content: null,
      body: null,
      fileUrl: null,
      opened: false,
    });
  }

  return refs;
}

export function appendKnowledgeToPromptParts(promptParts: string[], knowledge: KnowledgeRef[]): void {
  const entries = knowledge.filter((k) => k.id !== "knowledge-truncated-notice");
  if (entries.length === 0) {
    for (const k of knowledge) {
      if (k.id === "knowledge-truncated-notice") promptParts.push(`- ${k.title}`);
    }
    return;
  }

  promptParts.push(
    "[Library catalog — сначала оцените название и описание; полный текст только у записей OPENED]",
  );
  for (const k of entries) {
    const description = k.content?.trim() || "(без описания)";
    promptParts.push(
      `- [${k.id}] ${k.title}: ${description} | ${k.opened ? "OPENED" : "catalog only — не выдумывайте содержимое"}`,
    );
  }

  const opened = entries.filter((k) => k.opened && k.body?.trim());
  if (opened.length > 0) {
    promptParts.push("");
    promptParts.push("[Opened library documents — используйте только эти тексты как источник фактов]");
    for (const k of opened) {
      promptParts.push(`--- ${k.title} (${k.id}) ---`);
      promptParts.push(k.body!.trim());
    }
  }

  for (const k of knowledge) {
    if (k.id === "knowledge-truncated-notice") promptParts.push(`- ${k.title}`);
  }
}
