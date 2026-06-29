import {
  containsAnyKeyword,
  DIAGNOSE_KEYWORDS,
  hasCodeAuditConflictSignal,
  hasCodeAuditKeywords,
  hasDiagnoseConflictSignal,
  hasExplicitStructureMutationIntent,
  hasRuntimeDiagnoseKeywords,
  isComplaintOrCorrectionRequest,
  PRIMARY_STRUCTURE_VERBS,
} from "../structure-command-intent";

export type TechDepartmentIntent = "diagnose" | "structure" | "code_audit" | "unknown";

function hasStrongStructureSignal(text: string): boolean {
  if (isComplaintOrCorrectionRequest(text) && !hasExplicitStructureMutationIntent(text)) {
    return false;
  }
  if (!hasExplicitStructureMutationIntent(text)) return false;
  if (
    hasRuntimeDiagnoseKeywords(text) &&
    !containsAnyKeyword(text, PRIMARY_STRUCTURE_VERBS)
  ) {
    return false;
  }
  return true;
}

/**
 * Classify Tech Department task: runtime diagnosis vs structure mutation vs read-only code audit.
 * Separate from Mayor routing — runs only after Mayor delegated to Tech Department.
 */
export function classifyTechDepartmentIntent(taskText: string): TechDepartmentIntent {
  const text = taskText.trim();
  if (!text) return "unknown";

  const structure = hasStrongStructureSignal(text);
  const codeAudit = hasCodeAuditKeywords(text) || hasCodeAuditConflictSignal(text);
  const diagnose =
    containsAnyKeyword(text, DIAGNOSE_KEYWORDS) || hasRuntimeDiagnoseKeywords(text);

  if (structure && codeAudit && diagnose) {
    if (hasCodeAuditConflictSignal(text)) return "code_audit";
    if (hasDiagnoseConflictSignal(text)) return "diagnose";
    return "structure";
  }

  if (structure && codeAudit) {
    if (hasCodeAuditConflictSignal(text)) return "code_audit";
    return "structure";
  }

  if (structure && diagnose) {
    if (hasDiagnoseConflictSignal(text)) return "diagnose";
    return "structure";
  }

  if (codeAudit && diagnose) {
    if (hasCodeAuditConflictSignal(text)) return "code_audit";
    if (hasDiagnoseConflictSignal(text)) return "diagnose";
    return "code_audit";
  }

  if (structure && !diagnose && !codeAudit) return "structure";
  if (codeAudit) return "code_audit";
  if (diagnose) return "diagnose";

  return "diagnose";
}
