export type KnowledgeRowLike = {
  title: string;
  content: string | null;
  body?: string | null;
  file_url: string | null;
};

const STOP_WORDS = new Set([
  "как",
  "что",
  "это",
  "для",
  "при",
  "или",
  "его",
  "её",
  "они",
  "the",
  "and",
  "for",
  "with",
  "from",
  "why",
  "how",
  "what",
]);

export function tokenizeForKnowledgeMatch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

export function scoreKnowledgeRelevance(
  taskText: string,
  title: string,
  description: string | null,
): number {
  const taskLower = taskText.toLowerCase();
  const catalogLower = `${title} ${description ?? ""}`.toLowerCase();
  let score = 0;

  for (const token of tokenizeForKnowledgeMatch(taskText)) {
    if (catalogLower.includes(token)) score += 1;
  }

  const titleLower = title.trim().toLowerCase();
  if (titleLower.length >= 4 && taskLower.includes(titleLower)) {
    score += 2;
  }

  return score;
}

/** Full document text stored for agents and download fallback. */
export function getEffectiveKnowledgeBody(row: KnowledgeRowLike): string | null {
  if (row.body?.trim()) return row.body.trim();

  const content = row.content?.trim();
  if (!content) return null;

  // Legacy rows: full text lived in content before body column existed.
  if (!row.file_url) return content;
  if (content.startsWith("[Файл:")) return null;
  return content;
}

/** Catalog line shown to agents (description, not full file). */
export function getKnowledgeCatalogDescription(row: KnowledgeRowLike): string | null {
  const content = row.content?.trim();
  if (!content) return null;

  if (row.body?.trim()) return content;

  if (!row.file_url) {
    return content.length <= 240 ? content : `${content.slice(0, 240)}…`;
  }

  if (content.startsWith("[Файл:")) return content;
  return "есть прикреплённый файл — полный текст открывается при совпадении с запросом";
}

export function shouldOpenKnowledgeBody(
  taskText: string | undefined,
  row: KnowledgeRowLike,
): boolean {
  const body = getEffectiveKnowledgeBody(row);
  if (!body) return false;

  // Plain text note without attachment — always available.
  if (!row.file_url && !row.body?.trim()) return true;

  if (!taskText?.trim()) return true;

  const description = row.body?.trim() ? row.content : getKnowledgeCatalogDescription(row);
  return scoreKnowledgeRelevance(taskText, row.title, description) >= 1;
}
