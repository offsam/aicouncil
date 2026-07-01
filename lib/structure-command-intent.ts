/** Workspace entity nouns — generic mutation verbs require one of these (STRUCTURE-MUTATION-GATE-2). */
export const STRUCTURE_ENTITY_NOUNS = [
  "здание",
  "building",
  "chamber",
  "отдел",
  "department",
  "агент",
  "agent",
  "connection",
  "связь",
  "кабель",
  "назначение агента",
  "структура города",
  "структура системы",
  "палат",
  "комнат",
  "новый отдел",
  "новое здание",
];

/** Read-only / planning waivers — block structure mutation even when mutation verbs appear. */
const ANALYSIS_ONLY_WAIVER_PATTERNS: RegExp[] = [
  /пока\s+ничего\s+не\s+меняй/iu,
  /ничего\s+не\s+меняй/iu,
  /(?:^|[\s,.:;!?])только\s+покажи/iu,
  /(?:^|[\s,.:;!?])только\s+скажи/iu,
  /без\s+изменений/iu,
  /(?:^|[\s,.:;!?])не\s+выполняй/iu,
  /(?:^|[\s,.:;!?])не\s+изменяй/iu,
  /(?:^|[\s,.:;!?])не\s+создавай/iu,
  /(?:^|[\s,.:;!?])не\s+удаляй/iu,
  /(?:^|[\s,.:;!?])сначала\s+покажи/iu,
];

/** Code / implementation cues beyond hasCodeAuditKeywords (STRUCTURE-MUTATION-GATE-2). */
const CODE_ANALYSIS_PHRASES = [
  "файлы нужно изменить",
  "файлы надо изменить",
  "какие файлы",
  "покажи какие файлы",
  "покажи план",
  "console.log",
  "логирование",
  "логирован",
  "logging",
  "перед вызовом",
  "перед вызов",
  "implementation",
  "repository",
  "github",
  "typescript",
  "javascript",
  "api route",
  "route.ts",
  "исходный код",
  "source code",
  "в коде",
  "изменить код",
  "измени код",
  "добавить лог",
  "добавь лог",
  "добавь console",
  "добавить console",
];

/** Generic modify verbs — require structure entity noun unless explicit phrase matches. */
const GENERIC_MODIFY_STRUCTURE_VERB_RE =
  /(?:измен[\p{L}]*|изменить|помен[\p{L}]*|поменять|обнов[\p{L}]*|обновить|update)/giu;

/** Other structure verbs not covered by constructive/destructive stems. */
const OTHER_STRUCTURE_VERBS_WITH_NOUN = [
  "перенес",
  "перенести",
  "перемест",
  "переимен",
  "переименуй",
  "переименовать",
  "отключ",
  "отключи",
  "disconnect",
  "rename",
  "move",
  "connect",
];

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
  // camelCase identifiers (callConfiguredAgentProvider, executeMayorTask, …)
  if (/\b[a-z][a-z0-9]*(?:[A-Z][a-zA-Z0-9]+)+\b/.test(text)) return true;
  return false;
}

/** User explicitly asks for read-only analysis / planning — no structure mutation (STRUCTURE-MUTATION-GATE-2). */
export function hasAnalysisOnlyWaiver(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return ANALYSIS_ONLY_WAIVER_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** True when text names a workspace structure entity (building, chamber, agent assignment, …). */
export function hasStructureEntityNoun(text: string): boolean {
  return containsAnyKeyword(text, STRUCTURE_ENTITY_NOUNS);
}

/** Code change / file analysis intent — takes priority over structure mutation gate. */
export function hasCodingOrCodeAnalysisIntent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  if (hasCodeAuditKeywords(normalized) || hasExplicitCodeReference(normalized)) {
    return true;
  }

  const lower = normalized.toLowerCase();
  if (CODE_ANALYSIS_PHRASES.some((phrase) => lower.includes(phrase))) {
    return true;
  }

  // «код» without workspace structure nouns — source change, not city structure
  if (/\b(?:код|code)\b/iu.test(normalized) && !hasStructureEntityNoun(normalized)) {
    return true;
  }

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

/** True when user explicitly requests a structural DB/workspace change (SAFETY-01 + GATE-2). */
export function hasExplicitStructureMutationIntent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  if (containsAnyKeyword(normalized, EXPLICIT_STRUCTURE_MUTATION_PHRASES)) return true;
  if (PERMISSION_MUTATION_RE.test(normalized)) return true;
  if (DESCRIPTION_MUTATION_RE.test(normalized)) return true;

  const hasNoun = hasStructureEntityNoun(normalized);
  if (!hasNoun) return false;

  if (hasDestructiveStructureIntent(normalized)) return true;
  if (hasConstructiveStructureIntent(normalized)) return true;
  if (hasAffirmativeVerbMatch(normalized, GENERIC_MODIFY_STRUCTURE_VERB_RE)) return true;
  if (containsAnyKeyword(normalized, OTHER_STRUCTURE_VERBS_WITH_NOUN)) return true;

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

/** Mayor GitHub tool loop mode (MAYOR-CODING-GATE-3 — shared with structure gate). */
export type MayorGitHubToolMode = "code_audit" | "coding_task";

/** Conceptual / explanatory questions — not GitHub tool candidates (shared gate). */
const GITHUB_TOOL_CONCEPTUAL_EXCLUSIONS: RegExp[] = [
  /^что\s+такое\b/iu,
  /^what\s+is\b/i,
  /^what\s+are\b/i,
  /^объясни\b/iu,
  /^explain\b/i,
  /^почему\b/iu,
  /^why\b/i,
  /^зачем\b/iu,
  /^какие\s+(?:преимущества|минусы|плюсы|недостатки)\b/iu,
  /^what\s+are\s+the\s+(?:advantages|benefits|pros|cons)\b/i,
  /^расскажи\s+(?:про|о\b)/iu,
  /^tell\s+me\s+about\b/i,
];

/** Explicit source-change / file-plan requests → coding_task. */
const CODING_TASK_GITHUB_PATTERNS: RegExp[] = [
  /(?:^|[\s,.:;!?])поменяй\s+код/iu,
  /(?:^|[\s,.:;!?])измени\s+код/iu,
  /(?:^|[\s,.:;!?])исправь\s+код/iu,
  /\bchange\s+(the\s+)?code\b/i,
  /\bfix\s+(the\s+)?code\b/i,
  /\bmodify\s+(the\s+)?code\b/i,
  /\brefactor\b/i,
  /\bimplement\b.+\bcode\b/i,
  /(?:^|[\s,.:;!?])добавь.+(?:в\s+код)/iu,
  /(?:^|[\s,.:;!?])добавь\s.+(?:логирован|logging|console\.log)/iu,
  /(?:^|[\s,.:;!?])добавить\s.+(?:логирован|logging|console\.log)/iu,
];

/** Substrings that signal a coding plan / file-change task (not structure mutation). */
const CODING_TASK_INTENT_PHRASES = [
  "файлы нужно изменить",
  "файлы надо изменить",
  "покажи какие файлы",
  "покажи план",
  "изменить код",
  "измени код",
  "добавить лог",
  "добавь лог",
  "добавь console",
  "добавить console",
];

/** Non-code "where" questions — office/building, not repo lookup. */
const CODE_LOCATION_WHERE_NON_CODE_SUBJECT =
  /^(?:мой|моя|моё|наш|наша|наше|ты|вы|офис|отдел|здание|документ|встреча|контакт|юрист|юристы|ресторан)\b/iu;

/** Locate / inspect implementation in source (MAYOR-GITHUB-GATE-ADR-1 + GATE-3). */
const CODE_LOCATION_AUDIT_PATTERNS: RegExp[] = [
  /(?:^|[\s,.:;!?])где\s+(?:реализован|реализовано|реализована|находится|искать|лежит|хранится|считается|формируется|вызывается|создаётся|делается|определён|определяется|описан|описана|описано)/iu,
  /(?:^|[\s,.:;!?])как\s+(?:реализован|реализовано|реализована|устроен|устроено|устроена|работает)/iu,
  /(?:^|[\s,.:;!?])каким\s+образом\s+работает/iu,
  /(?:^|[\s,.:;!?])какой\s+файл/iu,
  /(?:^|[\s,.:;!?])в\s+каком\s+файле/iu,
  /(?:^|[\s,.:;!?])покажи\s+(?:код|реализацию)/iu,
  /(?:^|[\s,.:;!?])найди.+(?:в\s+коде|файл|где)/iu,
  /(?:^|[\s,.:;!?])проверь.+код/iu,
  /(?:^|[\s,.:;!?])проверь.+\bgithub\b/i,
  /(?:код|файл|\bpipeline\b|\bcall\b|\bfunction\b).+\bgithub\b/i,
  /\bwhere\s+(?:is|are|does|do)\b.+\b(code|file|located|implemented|defined|stored|handled)\b/i,
  /\bwhere\s+(?:is|does|are).+\b(formed|called|created|invoked|initialized)\b/i,
  /\bhow\s+(?:is|are|does|do)\b.+\b(implemented|built|structured|handled)\b/i,
  /\bhow\s+does\b.+\bwork\b/i,
  /\bwhich\s+file\b/i,
  /\bshow\s+(?:the\s+)?(?:code|implementation)\b/i,
  /\bfind\s+(?:the\s+)?(?:file|code)\b/i,
  /\blocate\s+(?:the\s+)?code\b/i,
  /\bcode\s+audit\b/i,
  /\busage\s+logging\b/i,
  /\bcheck\b.+\b(code|github|repo)\b/i,
  /найди.+\bgithub\b/i,
  /\b(look|search)\b.+\bgithub\b/i,
  /\bgithub\b.+(?:код|файл|где|\bpipeline\b|\bcall\b|\bfunction\b)/iu,
];

function hasBareCodeLocationQuestion(text: string): boolean {
  const match = text.match(/^где\s+(.+?)\??\s*$/iu);
  if (!match) return false;

  const subject = match[1]!.trim();
  if (!subject || CODE_LOCATION_WHERE_NON_CODE_SUBJECT.test(subject)) {
    return false;
  }

  if (/[A-Za-z]/.test(subject)) return true;
  if (/\s/.test(subject) && subject.split(/\s+/).length >= 2) return true;

  return false;
}

export function isConceptualGitHubToolExclusion(text: string): boolean {
  return GITHUB_TOOL_CONCEPTUAL_EXCLUSIONS.some((pattern) => pattern.test(text.trim()));
}

/** User wants a coding plan or source change brief — not workspace structure mutation. */
export function hasExplicitCodingTaskIntent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  if (CODING_TASK_GITHUB_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const lower = normalized.toLowerCase();
  return CODING_TASK_INTENT_PHRASES.some((phrase) => lower.includes(phrase));
}

/** User wants to locate or inspect implementation in the repository. */
export function hasCodeLocationAuditIntent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  if (CODE_LOCATION_AUDIT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return hasBareCodeLocationQuestion(normalized);
}

/**
 * Shared GitHub tool routing — single source of truth for code/coding intent (MAYOR-CODING-GATE-3).
 * Analysis-only waivers do NOT apply here (they only block structure mutation).
 */
export function classifyMayorGitHubToolMode(text: string): MayorGitHubToolMode | null {
  const normalized = text.trim();
  if (!normalized) return null;
  if (isConceptualGitHubToolExclusion(normalized)) return null;

  if (hasExplicitCodingTaskIntent(normalized)) return "coding_task";
  if (hasCodeLocationAuditIntent(normalized)) return "code_audit";
  if (hasCodingOrCodeAnalysisIntent(normalized)) return "coding_task";

  return null;
}

/**
 * True when the user asks to mutate workspace structure (create building/chamber, assign agents, etc.).
 * STRUCTURE-MUTATION-GATE-2: code/analysis waivers first; generic verbs require structure entity nouns.
 */
export function isStructureMutationCommand(taskText: string): boolean {
  const text = taskText.trim();
  if (!text) return false;

  if (hasAnalysisOnlyWaiver(text)) return false;
  if (hasCodingOrCodeAnalysisIntent(text)) return false;

  if (isComplaintOrCorrectionRequest(text) && !hasExplicitStructureMutationIntent(text)) {
    return false;
  }

  if (!hasExplicitStructureMutationIntent(text)) return false;

  const diagnose = containsAnyKeyword(text, DIAGNOSE_KEYWORDS);

  if (!diagnose) return true;
  if (hasDiagnoseConflictSignal(text)) return false;
  return true;
}
