/**
 * Verify Tech Department intent: structure / diagnose / code_audit conflicts.
 */
import { classifyTechDepartmentIntent } from "../lib/tech-department/intent";
import {
  hasCodeAuditConflictSignal,
  hasDiagnoseConflictSignal,
  isStructureMutationCommand,
} from "../lib/structure-command-intent";

const CASES = [
  {
    name: "conflict structure wins",
    text: "создай отдел и проверь почему routing",
    expectIntent: "structure" as const,
    expectStructureGate: true,
    expectDiagnoseSignal: false,
  },
  {
    name: "conflict diagnose wins (past failure)",
    text: "почему не создал отдел для видео",
    expectIntent: "diagnose" as const,
    expectStructureGate: false,
    expectDiagnoseSignal: true,
  },
  {
    name: "code audit with file path",
    text: "проверь логику в lib/tech-department/intent.ts",
    expectIntent: "code_audit" as const,
    expectCodeAuditSignal: true,
  },
  {
    name: "code audit find bug",
    text: "найди баг в classifyTechDepartmentIntent",
    expectIntent: "code_audit" as const,
    expectCodeAuditSignal: true,
  },
  {
    name: "runtime diagnose agents count",
    text: "сколько агентов в отделе и что было в логах",
    expectIntent: "diagnose" as const,
    expectCodeAuditSignal: false,
  },
  {
    name: "why routing generic stays diagnose",
    text: "почему не работает роутинг",
    expectIntent: "diagnose" as const,
  },
  {
    name: "why telegram feature code audit",
    text: "почему не работает Telegram handler",
    expectIntent: "code_audit" as const,
    expectCodeAuditSignal: true,
  },
  {
    name: "SAFETY-01 complaint not structure",
    text: "Исправь ответ, мне нужно правильное число агентов",
    expectIntent: "diagnose" as const,
    expectStructureGate: false,
  },
  {
    name: "SAFETY-01 wrong answer not structure",
    text: "Это неправильный ответ",
    expectIntent: "diagnose" as const,
    expectStructureGate: false,
  },
];

let failed = 0;
for (const c of CASES) {
  const intent = classifyTechDepartmentIntent(c.text);
  const gate = isStructureMutationCommand(c.text);
  const diagnoseSignal = hasDiagnoseConflictSignal(c.text);
  const codeAuditSignal = hasCodeAuditConflictSignal(c.text);

  const ok =
    intent === c.expectIntent &&
    (c.expectStructureGate === undefined || gate === c.expectStructureGate) &&
    (c.expectDiagnoseSignal === undefined || diagnoseSignal === c.expectDiagnoseSignal) &&
    (c.expectCodeAuditSignal === undefined || codeAuditSignal === c.expectCodeAuditSignal);

  console.log(`${ok ? "PASS" : "FAIL"} ${c.name}`);
  console.log(`  text: ${c.text}`);
  console.log(`  intent=${intent} (expected ${c.expectIntent})`);
  if (!ok) failed += 1;
}

if (failed > 0) process.exit(1);
console.log(`\n${CASES.length}/${CASES.length} passed`);
