import type { AnalysisReport, ConsensusRequestBody } from "./api-types";
import { anthropicUsage } from "./tokens";
import { insertLlmUsageLog } from "./llm-usage-log";

const MODEL = "claude-sonnet-4-6";

export type ConsensusVariant = "team" | "council";

function parseReport(raw: string): AnalysisReport | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<AnalysisReport>;
    if (
      parsed.consensus &&
      parsed.differences &&
      parsed.bestAnswer &&
      parsed.finalVerdict
    ) {
      return {
        consensus: parsed.consensus.trim(),
        differences: parsed.differences.trim(),
        bestAnswer: parsed.bestAnswer.trim(),
        finalVerdict: parsed.finalVerdict.trim(),
        bestModel: parsed.bestModel?.trim(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function fallbackReport(text: string): AnalysisReport {
  return {
    consensus: text,
    differences: "Не удалось выделить расхождения автоматически.",
    bestAnswer: "См. ответы отдельных моделей.",
    finalVerdict: text.slice(0, 500),
  };
}

function buildPrompt(
  answers: ConsensusRequestBody["answers"],
  variant: ConsensusVariant,
  chamberLead?: { agent: string; answer: string } | null,
): string {
  const others = chamberLead
    ? answers.filter((a) => a.agent !== chamberLead.agent)
    : answers;

  const leaderBlock = chamberLead
    ? `Ответ РУКОВОДИТЕЛЯ отдела (${chamberLead.agent}) — приоритет при противоречиях:\n${chamberLead.answer.trim()}\n\n`
    : "";

  const blocks = others
    .map((a, i) => `Ответ эксперта ${i + 1} (${a.agent}): ${a.answer.trim()}`)
    .join("\n\n");

  const brevity =
    variant === "team"
      ? "Режим Team — ответы краткие: 1–2 предложения на каждое поле JSON."
      : "Режим Council — полный structured report.";

  const leadRule = chamberLead
    ? " Если мнения расходятся с руководителем отдела — в finalVerdict отдай приоритет позиции руководителя, явно укажи это."
    : "";

  return `${leaderBlock}${blocks}

Проанализируй ответы экспертов и верни ТОЛЬКО валидный JSON без markdown:
{
  "consensus": "что совпадает у моделей",
  "differences": "где мнения расходятся",
  "bestAnswer": "какая модель дала лучший ответ и почему, кратко процитируй суть",
  "finalVerdict": "итоговое заключение анализатора",
  "bestModel": "имя модели"
}
${brevity}${leadRule}`;
}

export async function runConsensusAnalysis(
  answers: ConsensusRequestBody["answers"],
  variant: ConsensusVariant = "council",
  options?: { chamberLead?: { agent: string; answer: string } | null },
): Promise<{ report: AnalysisReport; usage?: ReturnType<typeof anthropicUsage> }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY не настроен на сервере.");
  }

  const filtered = answers?.filter((a) => a.agent && a.answer?.trim()) ?? [];
  if (filtered.length < 2) {
    throw new Error("Для сравнения нужно минимум два ответа.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: variant === "team" ? 1024 : 2048,
      messages: [{ role: "user", content: buildPrompt(filtered, variant, options?.chamberLead) }],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: { message?: string } }).error?.message === "string"
        ? (data as { error: { message: string } }).error.message
        : `Anthropic error ${response.status}`;
    throw new Error(message);
  }

  const textBlock = (
    data as { content?: Array<{ type: string; text?: string }> }
  ).content?.find((block) => block.type === "text");

  const raw = textBlock?.text?.trim();
  if (!raw) {
    throw new Error("Claude вернул пустой вывод.");
  }

  const report = parseReport(raw) ?? fallbackReport(raw);
  const usage = anthropicUsage(data);
  await insertLlmUsageLog({
    provider: "anthropic",
    modelId: MODEL,
    purpose: "consensus_analysis",
    rawUsage: (data as { usage?: unknown }).usage ?? null,
  });
  return { report, usage };
}
