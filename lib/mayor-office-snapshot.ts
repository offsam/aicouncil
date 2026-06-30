import type { OfficeInventoryCounts } from "./office-inventory-counts";
import {
  AGENT_COUNT_LABEL_CITY_DEPLOYED,
  AGENT_COUNT_LABEL_GLOBAL_CATALOG,
} from "./agent-count-labels";
import {
  containsAnyKeyword,
  isStructureMutationCommand,
  PRIMARY_STRUCTURE_VERBS,
} from "./structure-command-intent";

const DETAIL_HINT_RE = /(подробн|детальн|разбивк|breakdown|детализац|по\s+пунктам|все\s+цифры)/i;

const AGENTS_POOL_CUE_RE = /(всего|в\s+каталоге|каталог|в\s+пуле|\bpool\b|total)/i;

const COUNT_CUE_RE = /(сколько|количество|how\s+many|count\s+of)/i;
const INVENTORY_METRIC_RE =
  /(здани\w*|building\w*|отдел\w*|chamber\w*|агент\w*|agent\w*|соедин\w*|connection\w*|кабел\w*)/i;

const AGENT_METRIC_RE = /(агент\w*|agent\w*)/i;

/** Log fields when executeMayorTask answers from office-wide DB snapshot (MSA-1). */
export const OFFICE_INVENTORY_SNAPSHOT_REASONING =
  "Office inventory count question — answered from DB snapshot";
export const OFFICE_INVENTORY_SNAPSHOT_TRACE = ["mayor_agent", "office_inventory_snapshot"] as const;

/** Log fields when Mayor delegates read-only system questions to Tech Department (MCC-1). */
export const SYSTEM_READONLY_DELEGATE_REASONING =
  "Read-only system structure/routing question — delegate to Tech Department for diagnostic mode";
export const SYSTEM_READONLY_DELEGATE_TRACE = [
  "system_readonly_detector",
  "tech_department",
] as const;

/** City/infrastructure framing — distinguishes system audit from business-building troubleshooting. */
const SYSTEM_INFRA_KEYWORD_RE =
  /(?:структур|structure|город|city|workspace|инфраструктур|маршрут|routing|route|routing_logs|connection|connections|связ|кабел|делегир|delegate|invoke|вызыва|agent_assignments|entity_registry|chamber_archive|отдел[\p{L}]*\s+(?:не\s+)?получ|здани|building)/iu;

/** Audit / inspect phrasing for read-only system checks. */
const SYSTEM_AUDIT_PHRASE_RES: RegExp[] = [
  /(?:провер|check|audit|inspect|диагност)[\p{L}]*\s+(?:структур|structure|город|city|workspace|маршрут|routing)/iu,
  /(?:какие\s+)?(?:связ|connection|connections|кабел)[\p{L}]*\s+(?:у\s+)?(?:здани|building\b|\[)/iu,
  /(?:связ|connection|connections)[\p{L}]*\s+у\s+[\p{L}\d]/iu,
  /(?:провер|check|trace|audit)[\p{L}]*\s+(?:маршрут|route|routing|path)/iu,
  /маршрут[\p{L}]*\s+(?:до|в|к)\s+[\p{L}\d]/iu,
  /(?:почему|why)[\s\S]{0,80}(?:агент|agent)[\p{L}]*\s+(?:не\s+)?(?:вызыва|invoke|call|срабатыва)/iu,
  /(?:почему|why)[\s\S]{0,80}(?:отдел|chamber|department)[\p{L}]*\s+(?:не\s+)?(?:получа|receive|доста)[\p{L}]*\s*(?:задач|task)/iu,
];

/** Business/project building troubleshooting — not city infrastructure (fail closed). */
const BUSINESS_TROUBLESHOOT_RE =
  /(?:не\s+работает|не\s+отвечает|плохой\s+ответ|wrong\s+answer|исправь\s+ответ|не\s+понял\s+задач|не\s+тот\s+ответ)/iu;

const BUSINESS_BUILDING_CUE_RE =
  /(?:ресторан|юрист|citizly|маркетинг|бухгалтер|рилс|реклам|договор|контент)/iu;

function hasSystemReadOnlySignal(text: string): boolean {
  return SYSTEM_AUDIT_PHRASE_RES.some((re) => re.test(text));
}

function isBusinessBuildingTroubleshoot(text: string): boolean {
  if (!BUSINESS_TROUBLESHOOT_RE.test(text)) return false;
  if (!BUSINESS_BUILDING_CUE_RE.test(text)) return false;
  return !SYSTEM_INFRA_KEYWORD_RE.test(text);
}

/**
 * MCC-1: read-only questions about city structure, connections, routing, agent invocation.
 * Fail-closed when the request looks like business-building content troubleshooting.
 */
export function isSystemReadOnlyQuestion(taskText: string): boolean {
  const text = taskText.trim();
  if (!text) return false;
  if (isOfficeInventoryCountQuestion(text)) return false;
  if (isStructureMutationCommand(text)) return false;
  if (isBusinessBuildingTroubleshoot(text)) return false;
  if (!hasSystemReadOnlySignal(text)) return false;
  if (!SYSTEM_INFRA_KEYWORD_RE.test(text)) return false;
  return true;
}

/** Locative targets that prove office-wide scope (stems — match case endings). */
const OFFICE_WIDE_SCOPE_TARGET_RE =
  /^(?:систем|офис|город|каталог|пул|workspace|вс(?:е|ё)м|workspace)/i;

/** Cyrillic-safe word end — JS \\b is unreliable for Cyrillic. */
const CYR_WORD_END = String.raw`(?:\s|$|[,.!?;:—-])`;

const NARROW_SCOPE_U_RE = new RegExp(
  String.raw`(?:^|[\s,.!?;:—-])у\s+(?!нас${CYR_WORD_END}|меня${CYR_WORD_END}|вас${CYR_WORD_END}|тебя${CYR_WORD_END}|н[её]го${CYR_WORD_END}|них${CYR_WORD_END})[\p{L}\d]`,
  "iu",
);
const NARROW_SCOPE_V_RE = /(?:^|[\s,.!?;:—-])(?:в|во)\s+([\p{L}\d][\p{L}\d-]*)/giu;

function isOfficeWideScopeTarget(word: string): boolean {
  return OFFICE_WIDE_SCOPE_TARGET_RE.test(word.trim());
}

/**
 * Building/chamber/agent scope — detector must not return office-wide snapshot.
 * «у юристов», «в ресторане» — narrow; «в системе», «в офисе» — not narrow.
 */
export function hasNarrowInventoryScope(taskText: string): boolean {
  const text = taskText.trim();
  if (!text) return false;

  if (NARROW_SCOPE_U_RE.test(text)) return true;

  for (const match of text.matchAll(NARROW_SCOPE_V_RE)) {
    const target = match[1]?.trim() ?? "";
    if (!target) continue;
    if (isOfficeWideScopeTarget(target)) continue;
    return true;
  }

  return false;
}

/** True only when count question scope is provably office-wide (not building/chamber/agent). */
export function hasOfficeWideInventoryScope(taskText: string): boolean {
  const text = taskText.trim();
  if (!text) return false;
  if (hasNarrowInventoryScope(text)) return false;

  // Bare metric question — no locative scope → office-wide by convention.
  if (!/(?:^|[\s,.!?;:—-])(?:в|во|у)\s+[\p{L}\d]/iu.test(text)) return true;

  // Explicit office-wide locative («в системе», «в офисе», …).
  for (const match of text.matchAll(NARROW_SCOPE_V_RE)) {
    const target = match[1]?.trim() ?? "";
    if (target && isOfficeWideScopeTarget(target)) return true;
  }

  return false;
}

/** Read-only office inventory question — must reach Mayor LLM + snapshot, not structure gate. */
export function isOfficeInventoryCountQuestion(taskText: string): boolean {
  const text = taskText.trim();
  if (!text) return false;
  if (!COUNT_CUE_RE.test(text)) return false;
  if (!INVENTORY_METRIC_RE.test(text)) return false;
  if (containsAnyKeyword(text, PRIMARY_STRUCTURE_VERBS)) return false;
  if (!hasOfficeWideInventoryScope(text)) return false;
  return true;
}

export function mayorWantsDetailedSystemInventory(taskText: string): boolean {
  return DETAIL_HINT_RE.test(taskText.trim());
}

/** User asked for pool/catalog total in addition to deployed-on-posts. */
export function mayorWantsAgentsPoolCount(taskText: string): boolean {
  return AGENTS_POOL_CUE_RE.test(taskText.trim());
}

function formatFullInventoryBreakdown(counts: OfficeInventoryCounts): string {
  return [
    `Здания: ${counts.buildingsCount}.`,
    `Отделы: ${counts.chambersCount}.`,
    `${AGENT_COUNT_LABEL_CITY_DEPLOYED}: ${counts.agentsDeployedCount}.`,
    `${AGENT_COUNT_LABEL_GLOBAL_CATALOG}: ${counts.agentsPoolCount}.`,
    `Активных соединений: ${counts.activeConnectionsCount}.`,
  ].join(" ");
}

function formatAgentsInventoryAnswer(taskText: string, counts: OfficeInventoryCounts): string {
  if (mayorWantsAgentsPoolCount(taskText)) {
    return `${AGENT_COUNT_LABEL_CITY_DEPLOYED}: ${counts.agentsDeployedCount}; ${AGENT_COUNT_LABEL_GLOBAL_CATALOG}: ${counts.agentsPoolCount}`;
  }
  return `${AGENT_COUNT_LABEL_CITY_DEPLOYED}: ${counts.agentsDeployedCount}`;
}

/** Prompt block injected only on the Mayor path — authoritative DB counts for answer_self. */
export function formatMayorOfficeSnapshotPrompt(counts: OfficeInventoryCounts): string {
  const bench = Math.max(0, counts.agentsPoolCount - counts.agentsDeployedCount);

  return `[Office inventory snapshot — authoritative DB counts for this office]
Office ID: ${counts.officeId}
Buildings: ${counts.buildingsCount}
Chambers (departments): ${counts.chambersCount}
${AGENT_COUNT_LABEL_CITY_DEPLOYED}: ${counts.agentsDeployedCount}
${AGENT_COUNT_LABEL_GLOBAL_CATALOG}: ${counts.agentsPoolCount}
Agents on bench (global catalog minus city deployed): ${bench}
Active connections (both ends in this office): ${counts.activeConnectionsCount}
Snapshot time: ${counts.updatedAt}

Rules for system/meta questions (how many buildings, chambers, agents, connections):
- action: answer_self — never delegate these count questions to a building.
- Use ONLY the numbers above — do NOT infer counts from the building name list below.
- Buildings / chambers / connections: brief answer with the number only unless user asks подробно.
- Agents: default «сколько агентов» → only ${AGENT_COUNT_LABEL_CITY_DEPLOYED} («${AGENT_COUNT_LABEL_CITY_DEPLOYED}: N»). Do NOT mention global catalog unless user says всего, в каталоге, в пуле, or asks подробно.
- Agents with pool cue or подробно: «${AGENT_COUNT_LABEL_CITY_DEPLOYED}: N; ${AGENT_COUNT_LABEL_GLOBAL_CATALOG}: M» (or full breakdown when подробно).
- Do not mention documents, library RAG, or the building name list for these questions.`;
}

/** Deterministic user-facing answer from DB snapshot (brief by default). */
export function formatMayorInventoryAnswer(
  taskText: string,
  counts: OfficeInventoryCounts,
): string {
  if (mayorWantsDetailedSystemInventory(taskText)) {
    return formatFullInventoryBreakdown(counts);
  }

  const text = taskText.toLowerCase();
  const parts: string[] = [];
  if (/(здани\w*|building\w*)/.test(text)) parts.push(`здания: ${counts.buildingsCount}`);
  if (/(отдел\w*|chamber\w*)/.test(text)) parts.push(`отделы: ${counts.chambersCount}`);
  if (AGENT_METRIC_RE.test(text)) parts.push(formatAgentsInventoryAnswer(taskText, counts));
  if (/(соедин\w*|connection\w*|кабел\w*)/.test(text)) {
    parts.push(`соединения: ${counts.activeConnectionsCount}`);
  }

  if (parts.length > 1) {
    return parts.join("; ") + ".";
  }
  if (parts.length === 1) {
    return parts[0]!.includes(":") ? parts[0]! + "." : parts[0]!;
  }

  return `${counts.buildingsCount}`;
}
