/**
 * Lightweight LLM yes/no check for structure mutation commands.
 * Runs after keyword gate misses (slang, typos, non-standard phrasing).
 */

const STRUCTURE_COMMAND_LLM_PROMPT = (taskText: string) =>
  `Ты классификатор команд. Ответь только одним словом: да или нет.

Является ли сообщение пользователя командой на изменение структуры системы (создание здания, отдела/chamber, назначение агентов, связей между сущностями и т.п.)?

Не считай командой: вопросы о диагностике («почему не работает»), обычные вопросы по теме здания, запрос фактов или консультаций.

Сообщение: """${taskText}"""`;

async function callCheapLLM(prompt: string): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 8,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Groq API returned status ${response.status}`);
    }
    return (data.choices?.[0]?.message?.content || "").trim();
  }

  if (process.env.GOOGLE_API_KEY) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8 },
        }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini API returned status ${response.status}`);
    }
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  }

  throw new Error("No cheap LLM API key configured for structure command semantic gate");
}

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
export async function isStructureMutationCommandSemantic(taskText: string): Promise<boolean> {
  const text = taskText.trim();
  if (!text) return false;

  try {
    const answer = await callCheapLLM(STRUCTURE_COMMAND_LLM_PROMPT(text));
    const parsed = parseStructureCommandYesNo(answer);
    return parsed === true;
  } catch {
    return false;
  }
}
