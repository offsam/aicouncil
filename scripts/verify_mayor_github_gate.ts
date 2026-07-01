/**
 * MAYOR-GITHUB-GATE-ADR-1: intent-based GitHub trigger gate.
 * Run: npx tsx scripts/verify_mayor_github_gate.ts
 */
import { detectMayorGitHubToolRequest } from "../lib/mayor-github-invoke";

type Case = { label: string; query: string; expected: "code_audit" | "coding_task" | null };

const SHOULD_TRIGGER: Case[] = [
  { label: "architecture — Routing", query: "Где Routing?", expected: "code_audit" },
  { label: "architecture — Shared Memory", query: "Где Shared Memory?", expected: "code_audit" },
  { label: "architecture — Mutation Engine", query: "Где Mutation Engine?", expected: "code_audit" },
  { label: "architecture — Debate", query: "Где Debate?", expected: "code_audit" },
  { label: "architecture — Tool Calling", query: "Где Tool Calling?", expected: "code_audit" },
  { label: "architecture — Cost Controls", query: "Где Cost Controls?", expected: "code_audit" },
  { label: "implemented — Workflow Engine", query: "Где реализован Workflow Engine?", expected: "code_audit" },
  { label: "file — buildContext", query: "В каком файле находится buildContext?", expected: "code_audit" },
  { label: "structure — Routing Engine", query: "Как устроен Routing Engine?", expected: "code_audit" },
  { label: "regression — LLM call", query: "Где формируется LLM call?", expected: "code_audit" },
  {
    label: "regression — github audit",
    query: "Проверь в GitHub репозитории offsam/aicouncil код Mayor pipeline и скажи где формируется LLM call.",
    expected: "code_audit",
  },
  { label: "regression — usage logging", query: "Где находится код usage logging?", expected: "code_audit" },
  { label: "regression — show code", query: "Покажи код github_semantic_search", expected: "code_audit" },
];

const SHOULD_NOT_TRIGGER: Case[] = [
  { label: "conceptual — what is Routing", query: "Что такое Routing?", expected: null },
  { label: "conceptual — explain Mutation Engine", query: "Объясни Mutation Engine.", expected: null },
  { label: "conceptual — why Debate", query: "Почему Debate полезен?", expected: null },
  { label: "conceptual — Shared Memory benefits", query: "Какие преимущества Shared Memory?", expected: null },
  { label: "normal chat", query: "Что у нас дальше?", expected: null },
  { label: "status question", query: "RAG реализован?", expected: null },
  { label: "office where", query: "Где офис?", expected: null },
  { label: "english what is", query: "What is Routing?", expected: null },
];

const CODING_TASK: Case[] = [
  { label: "coding task", query: "Поменяй код чтобы Mayor логировал все вызовы", expected: "coding_task" },
];

function runCases(title: string, cases: Case[]) {
  console.log(`\n=== ${title} ===`);
  let failed = 0;
  for (const c of cases) {
    const got = detectMayorGitHubToolRequest(c.query);
    const pass = got === c.expected;
    console.log(`${pass ? "PASS" : "FAIL"} ${c.label}`, { query: c.query, expected: c.expected, got });
    if (!pass) failed += 1;
  }
  return failed;
}

function main() {
  const failed =
    runCases("should trigger code_audit", SHOULD_TRIGGER) +
    runCases("should NOT trigger", SHOULD_NOT_TRIGGER) +
    runCases("coding_task", CODING_TASK);

  console.log(`\n=== Summary ===`);
  if (failed > 0) {
    console.log(`${failed} failed`);
    process.exit(1);
  }
  console.log("all passed");
}

main();
