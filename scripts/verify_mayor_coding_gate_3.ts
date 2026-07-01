/**
 * MAYOR-CODING-GATE-3: unified code intent for structure gate + GitHub tool routing.
 * Run: npx tsx scripts/verify_mayor_coding_gate_3.ts
 */
import { detectMayorGitHubToolRequest } from "../lib/mayor-github-invoke";
import {
  classifyMayorGitHubToolMode,
  hasAnalysisOnlyWaiver,
  hasCodingOrCodeAnalysisIntent,
  isStructureMutationCommand,
} from "../lib/structure-command-intent";

type GithubCase = {
  label: string;
  query: string;
  expected: "code_audit" | "coding_task" | null;
};

const SHOULD_TRIGGER_GITHUB: GithubCase[] = [
  {
    label: "exact problematic query",
    query:
      "Добавь логирование перед вызовом callConfiguredAgentProvider. Пока ничего не меняй, только покажи какие файлы нужно изменить.",
    expected: "coding_task",
  },
  {
    label: "files for logging",
    query:
      "Покажи какие файлы нужно изменить для логирования перед callConfiguredAgentProvider.",
    expected: "coding_task",
  },
  {
    label: "console.log waiver",
    query: "Добавь console.log в lib/execute-chat-task.ts, но пока ничего не меняй.",
    expected: "coding_task",
  },
  {
    label: "show plan first",
    query: "Измени код так, чтобы Mayor логировал routing, но сначала покажи план.",
    expected: "coding_task",
  },
  {
    label: "where is called",
    query: "Где вызывается callConfiguredAgentProvider?",
    expected: "code_audit",
  },
  {
    label: "buildContext file",
    query: "В каком файле находится buildContext?",
    expected: "code_audit",
  },
];

const SHOULD_NOT_TRIGGER_GITHUB: GithubCase[] = [
  { label: "what is Routing", query: "Что такое Routing?", expected: null },
  { label: "explain Mutation Engine", query: "Объясни Mutation Engine.", expected: null },
  { label: "why Debate", query: "Почему Debate полезен?", expected: null },
  { label: "Shared Memory benefits", query: "Какие преимущества Shared Memory?", expected: null },
  { label: "normal chat", query: "Что у нас дальше?", expected: null },
];

const STRUCTURE_MUTATION: { label: string; query: string }[] = [
  { label: "create department", query: "Создай отдел маркетинг" },
  { label: "add agent", query: "Добавь агента GPT в Технический отдел" },
  { label: "assign claude", query: "Назначь Claude в юридический отдел" },
  { label: "delete building", query: "Удали здание Test" },
];

function runGithubCases(title: string, cases: GithubCase[]) {
  console.log(`\n=== ${title} ===`);
  let failed = 0;
  for (const c of cases) {
    const fromWrapper = detectMayorGitHubToolRequest(c.query);
    const fromShared = classifyMayorGitHubToolMode(c.query);
    const pass = fromWrapper === c.expected && fromShared === c.expected;
    console.log(`${pass ? "PASS" : "FAIL"} ${c.label}`, {
      expected: c.expected,
      gotWrapper: fromWrapper,
      gotShared: fromShared,
      analysisWaiver: hasAnalysisOnlyWaiver(c.query),
      codeIntent: hasCodingOrCodeAnalysisIntent(c.query),
    });
    if (!pass) failed += 1;
  }
  return failed;
}

function runStructureCases() {
  console.log("\n=== structure mutation (unchanged) ===");
  let failed = 0;
  for (const c of STRUCTURE_MUTATION) {
    const structure = isStructureMutationCommand(c.query);
    const github = detectMayorGitHubToolRequest(c.query);
    const pass = structure === true && github === null;
    console.log(`${pass ? "PASS" : "FAIL"} ${c.label}`, {
      structure,
      github,
    });
    if (!pass) failed += 1;
  }
  return failed;
}

function main() {
  let failed = 0;
  failed += runGithubCases("should trigger GitHub tools", SHOULD_TRIGGER_GITHUB);
  failed += runGithubCases("should NOT trigger GitHub tools", SHOULD_NOT_TRIGGER_GITHUB);
  failed += runStructureCases();

  // analysis waiver must not block GitHub on exact query
  const exact =
    "Добавь логирование перед вызовом callConfiguredAgentProvider. Пока ничего не меняй, только покажи какие файлы нужно изменить.";
  const waiverBlocksGithub = hasAnalysisOnlyWaiver(exact) && !detectMayorGitHubToolRequest(exact);
  console.log(`\n=== analysis waiver vs GitHub ===`);
  console.log(`${waiverBlocksGithub ? "FAIL" : "PASS"} waiver does not block GitHub tools`, {
    waiver: hasAnalysisOnlyWaiver(exact),
    github: detectMayorGitHubToolRequest(exact),
  });
  if (waiverBlocksGithub) failed += 1;

  console.log(`\n=== Summary ===`);
  if (failed > 0) {
    console.log(`${failed} failed`);
    process.exit(1);
  }
  console.log("all passed");
}

main();
