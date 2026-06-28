/**
 * Verify Tech Department conflict classification after hasDiagnoseConflictSignal fix.
 */
import { classifyTechDepartmentIntent } from "../lib/tech-department/intent";
import { hasDiagnoseConflictSignal, isStructureMutationCommand } from "../lib/structure-command-intent";

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
];

let failed = 0;
for (const c of CASES) {
  const intent = classifyTechDepartmentIntent(c.text);
  const gate = isStructureMutationCommand(c.text);
  const signal = hasDiagnoseConflictSignal(c.text);

  const ok =
    intent === c.expectIntent &&
    gate === c.expectStructureGate &&
    signal === c.expectDiagnoseSignal;

  console.log(`${ok ? "PASS" : "FAIL"} ${c.name}`);
  console.log(`  text: ${c.text}`);
  console.log(`  intent=${intent} (expected ${c.expectIntent})`);
  console.log(`  structure_gate=${gate} diagnose_signal=${signal}`);
  if (!ok) failed += 1;
}

if (failed > 0) process.exit(1);
console.log(`\n${CASES.length}/${CASES.length} passed`);
