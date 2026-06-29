import { invokeCheapLLM } from "./cheap-llm";
import type { MayorConversationTurn } from "./mayor-conversation-memory";
import {
  hasDestructiveStructureIntent,
  hasExplicitStructureMutationIntent,
  isStructureMutationCommand,
} from "./structure-command-intent";

export type StructureAnaphoraResolution =
  | { outcome: "expanded"; expandedText: string }
  | { outcome: "same" }
  | { outcome: "ambiguous"; reason: string };

/** Phrase / pattern signals — separate from EXTENDED_STRUCTURE_MUTATION_VERBS. */
const ANAPHORA_SUBSTRINGS = [
  "вторую часть",
  "второй части",
  "вторую задачу",
  "второй задачи",
  "второй шаг",
  "то же",
  "ту же",
  "тот же",
  "оставшиеся",
  "оставшийся",
  "оставшуюся",
  "предыдущ",
  "следующ",
];

const ANAPHORA_REGEXES = [
  /\bпредыдущ(?:ий|ую|ее|его|ем)\b/iu,
  /\bследующ(?:ий|ую|ее|его|ем)\b/iu,
  /\bэт(?:их|от|у|о|им|ому|ой|а)\b/iu,
  /\bвтор(?:ую|ой|ое|ая)\s+(?:часть|задачу|шаг)/iu,
  /\bтрет(?:ью|ьей|ий|ье|ья)\s+(?:часть|задачу|шаг)/iu,
  /\bперв(?:ую|ой|ое|ая)\s+(?:часть|задачу|шаг)/iu,
  /\b(?:сделай|создай|добавь)\s+втор(?:ую|ой)/iu,
];

const ENTITY_NOUN_AFTER_ORDINAL =
  /\b(?:втор|трет|перв|четверт|пят)(?:ую|ой|ое|ая|ье|ья)\s+(?:отдел|здан|building|chamber|комнат|палат)/iu;

export function hasStructureAnaphoraSignal(taskText: string): boolean {
  const text = taskText.trim();
  if (!text) return false;

  const normalized = ` ${text.toLowerCase()} `;
  for (const phrase of ANAPHORA_SUBSTRINGS) {
    if (normalized.includes(` ${phrase} `) || normalized.includes(phrase)) return true;
  }
  for (const re of ANAPHORA_REGEXES) {
    if (re.test(text)) return true;
  }

  if (ENTITY_NOUN_AFTER_ORDINAL.test(text)) return false;

  if (/\b(?:втор|трет|перв|четверт|пят)(?:ую|ой|ое|ая|ье|ья)\b/iu.test(text)) {
    return true;
  }

  return false;
}

export function shouldAttemptStructureAnaphoraResolution(taskText: string): boolean {
  return isStructureMutationCommand(taskText) || hasStructureAnaphoraSignal(taskText);
}

function formatHistoryForPrompt(modelHistory: MayorConversationTurn[]): string {
  if (modelHistory.length === 0) return "(пусто)";
  return modelHistory
    .map((turn) => `${turn.role === "user" ? "Пользователь" : "Ассистент"}: ${turn.content}`)
    .join("\n");
}

function isLikelyEntityReferencedInHistory(
  taskText: string,
  modelHistory: MayorConversationTurn[],
): boolean {
  const history = modelHistory.map((t) => t.content.toLowerCase()).join(" ");
  const text = taskText.toLowerCase();

  for (const match of text.matchAll(/[«"]([^»"]+)[»"]/g)) {
    const name = match[1]?.trim().toLowerCase();
    if (name && history.includes(name)) return true;
  }

  const afterVerb = text
    .replace(/^.*?(?:удал\w*|remove|delete|созда\w*|добав\w*|назнач\w*)\s+/iu, "")
    .trim();
  const stopWords = new Set([
    "отдел",
    "здание",
    "building",
    "chamber",
    "агента",
    "агент",
    "the",
    "a",
    "кабель",
    "связь",
  ]);
  const tokens = afterVerb
    .split(/\s+/)
    .map((t) => t.replace(/[.,!?;:]+$/g, ""))
    .filter((t) => t.length > 0 && !stopWords.has(t));

  if (tokens.length === 0) return false;

  const phrase = tokens.slice(0, 3).join(" ");
  if (phrase.length >= 4 && history.includes(phrase)) return true;
  return tokens.some((t) => t.length >= 4 && history.includes(t));
}

/** Deterministic fallback when history explicitly lists part 2 name (e.g. «часть 2 — разработка»). */
function tryExpandSecondStructurePart(
  taskText: string,
  modelHistory: MayorConversationTurn[],
): string | null {
  if (!/втор(?:ую|ой|ое|ая)\s+(?:часть|задачу|шаг)/iu.test(taskText)) {
    return null;
  }

  const history = modelHistory.map((t) => t.content).join("\n");
  const part2Match = history.match(/часть\s*2\s*(?:[—–-]|[:])\s*([^\n,.;]+)/iu);
  const partName = part2Match?.[1]?.trim().replace(/[»"«]/g, "");
  if (!partName || partName.length < 2) return null;

  const buildingMatch =
    history.match(/здан(?:ие|ия)\s+([А-ЯA-Za-z0-9«"]+(?:\s+[А-ЯA-Za-z0-9]+)?)/iu) ??
    history.match(/create_building\s+[«"]?([^»"\n]+)/iu);
  const buildingName = buildingMatch?.[1]?.trim().replace(/[»"«]/g, "");
  if (!buildingName) {
    return `создай отдел ${partName}`;
  }
  return `создай отдел ${partName} в здании ${buildingName}`;
}

function buildAnaphoraExpansionPrompt(taskText: string, modelHistory: MayorConversationTurn[]): string {
  return `Ты resolver анафорических structure-команд AI-офиса. Разверни короткую или местоимённую команду в одну полную команду на изменение структуры (здания, отделы/chamber, назначения агентов, связи).

ПРАВА resolver (только это):
- раскрыть referent из истории разговора;
- заменить местоимение, порядковый номер или «вторая часть/задача» на конкретное имя здания/отдела из истории;
- если в истории был план с частями 1 и 2 — «вторая часть/задача» → явная create/delete команда для второй части (имя из истории).

ЗАПРЕЩЕНО:
- придумывать новые намерения, которых не было в команде или истории;
- выдумывать имена сущностей, которых не было в истории;
- менять тип действия (создание ↔ удаление и т.д.).

Если referent однозначно не восстанавливается из истории — status=ambiguous с коротким reason на русском.
Если развёрнутая команда не является явной structure-mutation (создай/удали/добавь/назначь/подключи здание/отдел/агента/связь) — status=ambiguous.

История разговора:
${formatHistoryForPrompt(modelHistory)}

Текущая команда пользователя:
"""${taskText.replace(/"/g, '\\"')}"""

Ответь ТОЛЬКО JSON:
{
  "status": "expanded" | "ambiguous",
  "expandedText": "полная команда одной строкой на русском или пустая строка",
  "reason": "короткое объяснение на русском только при ambiguous"
}`;
}

type ExpansionLlmPayload = {
  status?: string;
  expandedText?: string;
  reason?: string;
};

function parseExpansionLlmResponse(raw: string): ExpansionLlmPayload | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as ExpansionLlmPayload;
  } catch {
    return null;
  }
}

export async function resolveStructureCommandAnaphora(
  taskText: string,
  modelHistory: MayorConversationTurn[],
  options?: { officeId?: string },
): Promise<StructureAnaphoraResolution> {
  const text = taskText.trim();
  if (!text) return { outcome: "same" };

  if (!shouldAttemptStructureAnaphoraResolution(text)) {
    return { outcome: "same" };
  }

  if (!hasStructureAnaphoraSignal(text)) {
    const unknownDeleteTarget =
      hasDestructiveStructureIntent(text) &&
      modelHistory.length > 0 &&
      !isLikelyEntityReferencedInHistory(text, modelHistory);

    if (isCompleteStructureMutationWithoutAnaphora(text) && !unknownDeleteTarget) {
      return { outcome: "same" };
    }
    if (!unknownDeleteTarget) {
      return { outcome: "same" };
    }
  }

  if (modelHistory.length === 0) {
    return {
      outcome: "ambiguous",
      reason: "нет истории разговора для восстановления контекста",
    };
  }

  const deterministicEarly = tryExpandSecondStructurePart(text, modelHistory);
  if (deterministicEarly && isStructureMutationCommand(deterministicEarly)) {
    return { outcome: "expanded", expandedText: deterministicEarly };
  }

  try {
    const responseText = await invokeCheapLLM({
      purpose: "structure-anaphora-expand",
      prompt: buildAnaphoraExpansionPrompt(text, modelHistory),
      responseFormat: "json",
      temperature: 0,
      maxTokens: 512,
      officeId: options?.officeId,
    });

    const parsed = parseExpansionLlmResponse(responseText);
    if (!parsed || parsed.status === "ambiguous") {
      const deterministic = tryExpandSecondStructurePart(text, modelHistory);
      if (deterministic && isStructureMutationCommand(deterministic)) {
        return { outcome: "expanded", expandedText: deterministic };
      }
      const reason =
        parsed?.reason?.trim() ||
        "Не удалось однозначно восстановить, о какой сущности идёт речь. Уточните название здания или отдела.";
      return { outcome: "ambiguous", reason };
    }

    if (parsed.status !== "expanded") {
      return {
        outcome: "ambiguous",
        reason: "Не удалось развернуть команду. Уточните, что именно нужно изменить.",
      };
    }

    const expandedText = String(parsed.expandedText ?? "").trim();
    if (!expandedText) {
      return {
        outcome: "ambiguous",
        reason:
          parsed.reason?.trim() ||
          "Не удалось однозначно восстановить, о какой сущности идёт речь. Уточните название здания или отдела.",
      };
    }

    if (!isStructureMutationCommand(expandedText)) {
      const deterministic = tryExpandSecondStructurePart(text, modelHistory);
      if (deterministic && isStructureMutationCommand(deterministic)) {
        return { outcome: "expanded", expandedText: deterministic };
      }
      return {
        outcome: "ambiguous",
        reason:
          parsed.reason?.trim() ||
          "После разворачивания команда не является явным запросом на изменение структуры. Уточните формулировку.",
      };
    }

    if (expandedText === text) {
      return { outcome: "same" };
    }

    return { outcome: "expanded", expandedText };
  } catch {
    return {
      outcome: "ambiguous",
      reason: "Не удалось развернуть команду из контекста. Повторите запрос с явным названием здания или отдела.",
    };
  }
}

/** True when mutation verb present but no anaphora — used in tests/diagnostics. */
export function isCompleteStructureMutationWithoutAnaphora(taskText: string): boolean {
  return hasExplicitStructureMutationIntent(taskText) && !hasStructureAnaphoraSignal(taskText);
}
