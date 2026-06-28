import {
  containsAnyKeyword,
  DIAGNOSE_KEYWORDS,
  hasDiagnoseConflictSignal,
  hasStructureMutationKeywords,
} from "../structure-command-intent";

export type TechDepartmentIntent = "diagnose" | "structure" | "unknown";

/**
 * Classify Tech Department task: read-only diagnosis vs structure mutation command.
 * Separate from Mayor routing — runs only after Mayor delegated to Tech Department.
 */
export function classifyTechDepartmentIntent(taskText: string): TechDepartmentIntent {
  const text = taskText.trim();
  if (!text) return "unknown";

  const structure = hasStructureMutationKeywords(text);
  const diagnose = containsAnyKeyword(text, DIAGNOSE_KEYWORDS);

  if (structure && !diagnose) return "structure";
  if (diagnose && !structure) return "diagnose";
  if (structure && diagnose) {
    if (hasDiagnoseConflictSignal(text)) return "diagnose";
    return "structure";
  }
  return "diagnose";
}
