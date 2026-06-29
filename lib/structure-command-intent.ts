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

/** Explicit mutation verbs beyond PRIMARY — required for SAFETY-01 gate. */
export const EXTENDED_STRUCTURE_MUTATION_VERBS = [
  ...PRIMARY_STRUCTURE_VERBS,
  "удали",
  "удалить",
  "убери",
  "убрать",
  "перенес",
  "перенести",
  "перемест",
  "переимен",
  "переименуй",
  "переименовать",
  "отключ",
  "отключи",
  "disconnect",
  "remove",
  "delete",
  "rename",
  "move",
  "connect",
  "стереть",
  "стирай",
  "измени",
  "изменить",
];

/** Compound phrases that alone prove structural intent (no bare noun match). */
export const EXPLICIT_STRUCTURE_MUTATION_PHRASES = [
  "новый отдел",
  "новое здание",
  "измени описание",
  "изменить описание",
  "change description",
  "change permissions",
  "измени разрешен",
  "изменить разрешен",
];

/**
 * User-facing refusal when delete/remove is requested via chat Mutation Planner.
 * Current planner is create-only; a future Mutation Engine may support destructive ops.
 */
export const CHAT_DESTRUCTIVE_MUTATION_UNSUPPORTED_ANSWER =
  "Удаление через чат пока не поддерживается. Используйте Inspector или соответствующий интерфейс управления.";

/** Affirmative delete/remove/erase verb stems (Cyrillic-safe). */
const DESTRUCTIVE_VERB_RE = /(?:удал[\p{L}]*|remove|delete|стер[\p{L}]*)/giu;

/** Affirmative create/add/connect/assign verb stems (Cyrillic-safe) — PLANNER-COMPOUND-1B. */
const CONSTRUCTIVE_VERB_RE =
  /(?:созда[\p{L}]*|создать|добав[\p{L}]*|добавить|подключ[\p{L}]*|подключить|назнач[\p{L}]*|назначить)/giu;

/** User-facing refusal when delete+create appear in one structure command (v1: separate steps). */
export const CHAT_COMPOUND_DESTRUCTIVE_CREATE_ANSWER =
  "Команда содержит удаление и создание. Сейчас такие изменения нужно запускать отдельными подтверждаемыми шагами.";

function hasAffirmativeVerbMatch(text: string, pattern: RegExp): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  const re = new RegExp(pattern.source, pattern.flags);
  for (const match of normalized.matchAll(re)) {
    const start = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, start - 4), start);
    if (/(?:^|\s)не\s*$/iu.test(prefix)) continue;
    return true;
  }
  return false;
}

/** True when user asks to delete/remove/erase workspace entities (TD-02B). */
export function hasDestructiveStructureIntent(text: string): boolean {
  return hasAffirmativeVerbMatch(text, DESTRUCTIVE_VERB_RE);
}

/** True when user asks to create/add/connect/assign structure (explicit create stems only). */
export function hasConstructiveStructureIntent(text: string): boolean {
  return hasAffirmativeVerbMatch(text, CONSTRUCTIVE_VERB_RE);
}

/** Compound destructive+create in one command — block before planner (PLANNER-COMPOUND-1B). */
export function hasCompoundDestructiveCreateStructureIntent(text: string): boolean {
  return hasDestructiveStructureIntent(text) && hasConstructiveStructureIntent(text);
}

/** User complaint / correction — must not become structure_plan without explicit mutation verb. */
const COMPLAINT_CORRECTION_RE =
  /(?:неправильн|исправь|исправить|wrong\s+answer|correct\s+(?:answer|number)|нуж(?:ен|но)\s+правильн|не\s+(?:распозна|сохраня|понял|услыш)|ты\s+(?:ошиб|не\s+понял)|это\s+не\s+(?:то|верн)|мне\s+нуж(?:ен|на)\s+правильн|не\s+тот\s+ответ|не\s+та\s+цифр|не\s+то\s+числ)/iu;

const PERMISSION_MUTATION_RE =
  /(?:измен\w*|change|update|set)\s+(?:\w+\s+){0,3}(?:permission|разрешен|read_|send_tasks)/iu;

const DESCRIPTION_MUTATION_RE =
  /(?:измен\w*|change|update|set)\s+(?:\w+\s+){0,3}(?:описани|routing_description|description)/iu;

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

/** True when user explicitly requests a structural DB/workspace change (SAFETY-01). */
export function hasExplicitStructureMutationIntent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (containsAnyKeyword(normalized, EXTENDED_STRUCTURE_MUTATION_VERBS)) return true;
  if (containsAnyKeyword(normalized, EXPLICIT_STRUCTURE_MUTATION_PHRASES)) return true;
  if (PERMISSION_MUTATION_RE.test(normalized)) return true;
  if (DESCRIPTION_MUTATION_RE.test(normalized)) return true;
  return false;
}

/** Complaint, correction, or disagreement about a prior answer — not a mutation request. */
export function isComplaintOrCorrectionRequest(text: string): boolean {
  return COMPLAINT_CORRECTION_RE.test(text.trim());
}

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
 * SAFETY-01: bare nouns (агент, здание) are insufficient; complaints without explicit mutation are excluded.
 */
export function isStructureMutationCommand(taskText: string): boolean {
  const text = taskText.trim();
  if (!text) return false;

  if (isComplaintOrCorrectionRequest(text) && !hasExplicitStructureMutationIntent(text)) {
    return false;
  }

  if (!hasExplicitStructureMutationIntent(text)) return false;

  const diagnose = containsAnyKeyword(text, DIAGNOSE_KEYWORDS);

  if (!diagnose) return true;
  if (hasDiagnoseConflictSignal(text)) return false;
  return true;
}
