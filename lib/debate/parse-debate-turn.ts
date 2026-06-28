import type { ParsedDebateTurn } from "./types";

function fallbackConfirm(raw: string): ParsedDebateTurn {
  return { verdict: "confirm", optionalNotes: raw.trim().slice(0, 500) || undefined };
}

export function parseDebateTurn(raw: string): ParsedDebateTurn {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    if (trimmed.length > 80) {
      return { verdict: "revise", criticalIssues: "Ответ не в JSON-формате", answer: trimmed };
    }
    return fallbackConfirm(trimmed);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ParsedDebateTurn>;
    const verdict = parsed.verdict === "revise" ? "revise" : "confirm";
    if (verdict === "confirm") {
      return {
        verdict: "confirm",
        optionalNotes: parsed.optionalNotes?.trim() || undefined,
      };
    }
    const answer = parsed.answer?.trim();
    if (!answer) {
      return fallbackConfirm(trimmed);
    }
    return {
      verdict: "revise",
      criticalIssues: parsed.criticalIssues?.trim() || "Критическая правка без пояснения",
      answer,
    };
  } catch {
    return fallbackConfirm(trimmed);
  }
}
