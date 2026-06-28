/** Substring match (case-insensitive) — supports Cyrillic and morphology (e.g. агент → агентов). */
export const STRUCTURE_MUTATION_KEYWORDS = [
  "создай",
  "создать",
  "добавь",
  "добавить",
  "назначь",
  "назначить",
  "подключи",
  "связь",
  "connection",
  "building",
  "chamber",
  "отдел",
  "здание",
  "агент",
  "новый отдел",
  "новое здание",
];

/** Longer phrases first where order could matter for overlapping substrings. */
export const DIAGNOSE_KEYWORDS = [
  "что случилось",
  "не работает",
  "связь не",
  "не отвечает",
  "не маршрутиз",
  "почему",
  "ошибк",
  "завис",
  "fallback",
  "роутинг",
  "routing",
  "диагност",
];

export function containsAnyKeyword(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

/** Runtime / DB-state questions — not source-code audit. */
export const RUNTIME_DIAGNOSE_KEYWORDS = [
  "сколько агентов",
  "что было в логах",
  "что в логах",
  "routing_logs",
  "завис запрос",
  "зависло",
  "состояние",
  "сколько записей",
  "chamber_archive",
  "agent_assignments",
];

/** Source-code audit cues (distinct from runtime diagnose). */
export const CODE_AUDIT_KEYWORDS = [
  "найди баг",
  "find bug",
  "проверь логику",
  "check logic",
  "проведи аудит",
  "code audit",
  "code_audit",
  "исходный код",
  "source code",
  "репозитор",
  "repository",
  "функци",
  "function ",
  ".ts",
  ".tsx",
  "lib/",
  "app/api/",
  "импорт",
  "import ",
];

export function hasCodeAuditKeywords(text: string): boolean {
  return containsAnyKeyword(text, CODE_AUDIT_KEYWORDS) || hasExplicitCodeReference(text);
}

export function hasExplicitCodeReference(text: string): boolean {
  const normalized = text.toLowerCase();
  if (/\b[\w./-]+\.(ts|tsx|js|jsx|sql)\b/.test(normalized)) return true;
  if (/(?:^|[\s(])@\/[\w./-]+/.test(text)) return true;
  if (/(?:^|[\s(])(?:lib|app|components|scripts)\/[\w./-]+/.test(normalized)) return true;
  if (/\b(?:функци[яию]|function|метод)\s+[`'"]?\w+/iu.test(text)) return true;
  return false;
}

/** Explicit file/function/code mention wins over generic diagnose cues (mirrors hasDiagnoseConflictSignal). */
export function hasCodeAuditConflictSignal(text: string): boolean {
  if (hasExplicitCodeReference(text)) return true;

  const normalized = text.toLowerCase();
  const auditPhrases = [
    "найди баг",
    "find bug",
    "проверь логику",
    "check logic",
    "проведи аудит",
    "code audit",
    "code_audit",
  ];
  if (auditPhrases.some((p) => normalized.includes(p))) return true;

  // «почему не работает X» with technical/code framing (not pure runtime DB question)
  if (/почему не работает/i.test(normalized) && hasExplicitCodeReference(text)) return true;
  if (/почему не работает/i.test(normalized) && /\b(telegram|api|route|handler|комponent|component|логик)\b/i.test(normalized)) {
    return true;
  }

  return false;
}

export function hasRuntimeDiagnoseKeywords(text: string): boolean {
  return containsAnyKeyword(text, RUNTIME_DIAGNOSE_KEYWORDS);
}

export function hasStructureMutationKeywords(text: string): boolean {
  return containsAnyKeyword(text, STRUCTURE_MUTATION_KEYWORDS);
}


/** Imperative verbs that start a structure mutation when they precede diagnose cues. */
export const PRIMARY_STRUCTURE_VERBS = [
  "создай",
  "создать",
  "добавь",
  "добавить",
  "назначь",
  "назначить",
  "подключи",
];

function earliestKeywordIndex(text: string, keywords: string[]): number {
  const normalized = text.toLowerCase();
  let min = Number.POSITIVE_INFINITY;
  for (const keyword of keywords) {
    const idx = normalized.indexOf(keyword.toLowerCase());
    if (idx >= 0 && idx < min) min = idx;
  }
  return min;
}

export function hasDiagnoseConflictSignal(text: string): boolean {
  const normalized = text.toLowerCase();

  if (/не (создал|работает|получил)/i.test(normalized)) return true;

  const whyIdx = normalized.indexOf("почему");
  if (whyIdx < 0) return false;

  const verbIdx = earliestKeywordIndex(normalized, PRIMARY_STRUCTURE_VERBS);
  const compoundIdx = earliestKeywordIndex(normalized, ["новый отдел", "новое здание"]);
  const firstStructure = Math.min(verbIdx, compoundIdx);

  // «создай отдел … почему routing» — structure is the main action; «почему» is a side check.
  if (firstStructure < whyIdx) return false;

  return true;
}

/**
 * True when the user asks to mutate workspace structure (create building/chamber, assign agents, etc.).
 * Used by Mayor routing before semantic LLM and by Tech Department intent classification.
 */
export function isStructureMutationCommand(taskText: string): boolean {
  const text = taskText.trim();
  if (!text) return false;

  const structure = hasStructureMutationKeywords(text);
  const diagnose = containsAnyKeyword(text, DIAGNOSE_KEYWORDS);

  if (structure && !diagnose) return true;
  if (diagnose && !structure) return false;
  if (structure && diagnose) {
    if (hasDiagnoseConflictSignal(text)) return false;
    return true;
  }
  return false;
}
