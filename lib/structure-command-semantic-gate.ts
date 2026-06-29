/**
 * Lightweight LLM yes/no check for structure mutation commands.
 * Runs after keyword gate misses (slang, typos, non-standard phrasing).
 */

import { invokeCheapLLM } from "./cheap-llm";

const STRUCTURE_COMMAND_LLM_PROMPT = (taskText: string) =>
  `Ты классификатор команд. Ответь только одним словом: да или нет.

Является ли сообщение пользователя командой на изменение структуры системы (создание здания, отдела/chamber, назначение агентов, связей между сущностями и т.п.)?

Не считай командой: вопросы о диагностике («почему не работает»), обычные вопросы по теме здания, запрос фактов или консультаций.

Сообщение: """${taskText}"""`;

/** Parse LLM yes/no answer (да/yes/true vs нет/no/false). */
export function parseStructureCommandYesNo(answer: string): boolean | null {
  const normalized = answer.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (!normalized) return null;
  if (/^(да|yes|true|1)\b/.test(normalized)) return true;
  if (/^(нет|no|false|0)\b/.test(normalized)) return false;
  if (normalized.includes("да") && !normalized.includes("нет")) return true;
  if (normalized.includes("нет") && !normalized.includes("да")) return false;
  return null;
}

/**
 * LLM gate: is this a structure mutation command when keywords did not match?
 * Returns false on ambiguous/unparseable LLM output (fail open to semantic routing).
 */
export async function isStructureMutationCommandSemantic(
  taskText: string,
  options?: { officeId?: string },
): Promise<boolean> {
  const text = taskText.trim();
  if (!text) return false;

  try {
    const answer = await invokeCheapLLM({
      purpose: "structure-command-gate",
      prompt: STRUCTURE_COMMAND_LLM_PROMPT(text),
      responseFormat: "text",
      temperature: 0,
      maxTokens: 8,
      officeId: options?.officeId,
    });
    const parsed = parseStructureCommandYesNo(answer);
    return parsed === true;
  } catch {
    return false;
  }
}
