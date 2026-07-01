/**
 * STRUCTURE-MUTATION-GATE-2: code intent and analysis waivers block false structure mutation.
 * Run: npx tsx scripts/verify_structure_mutation_gate_2.ts
 */
import {
  hasAnalysisOnlyWaiver,
  hasCodingOrCodeAnalysisIntent,
  hasExplicitStructureMutationIntent,
  isStructureMutationCommand,
} from "../lib/structure-command-intent";

type Case = { label: string; query: string; expectStructure: boolean };

const SHOULD_NOT_MUTATE: Case[] = [
  {
    label: "exact problematic query",
    query:
      "Добавь логирование перед вызовом callConfiguredAgentProvider. Пока ничего не меняй, только покажи какие файлы нужно изменить.",
    expectStructure: false,
  },
  {
    label: "files for logging",
    query:
      "Покажи какие файлы нужно изменить для логирования перед callConfiguredAgentProvider.",
    expectStructure: false,
  },
  {
    label: "console.log waiver",
    query: "Добавь console.log в lib/execute-chat-task.ts, но пока ничего не меняй.",
    expectStructure: false,
  },
  {
    label: "show plan first",
    query: "Измени код так, чтобы Mayor логировал routing, но сначала покажи план.",
    expectStructure: false,
  },
  {
    label: "do not create waiver",
    query: "Не создавай ничего, только покажи какие файлы надо изменить.",
    expectStructure: false,
  },
];

const SHOULD_MUTATE: Case[] = [
  { label: "create department", query: "Создай отдел маркетинг", expectStructure: true },
  {
    label: "add agent to tech dept",
    query: "Добавь агента GPT в Технический отдел",
    expectStructure: true,
  },
  {
    label: "assign claude",
    query: "Назначь Claude в юридический отдел",
    expectStructure: true,
  },
  { label: "delete building", query: "Удали здание Test", expectStructure: true },
  {
    label: "create connection",
    query: "Создай connection между Legal и Finance",
    expectStructure: true,
  },
  {
    label: "change department description",
    query: "Измени описание отдела Marketing",
    expectStructure: true,
  },
];

function runCases(title: string, cases: Case[]) {
  console.log(`\n=== ${title} ===`);
  let failed = 0;
  for (const c of cases) {
    const structure = isStructureMutationCommand(c.query);
    const pass = structure === c.expectStructure;
    console.log(`${pass ? "PASS" : "FAIL"} ${c.label}`, {
      query: c.query.slice(0, 90) + (c.query.length > 90 ? "…" : ""),
      expectStructure: c.expectStructure,
      got: structure,
      codeIntent: hasCodingOrCodeAnalysisIntent(c.query),
      analysisWaiver: hasAnalysisOnlyWaiver(c.query),
      explicitStructure: hasExplicitStructureMutationIntent(c.query),
    });
    if (!pass) failed += 1;
  }
  return failed;
}

function main() {
  const failed =
    runCases("should NOT trigger structure mutation", SHOULD_NOT_MUTATE) +
    runCases("should trigger structure mutation", SHOULD_MUTATE);

  console.log(`\n=== Summary ===`);
  if (failed > 0) {
    console.log(`${failed} failed`);
    process.exit(1);
  }
  console.log("all passed");
}

main();
