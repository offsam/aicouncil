/**
 * MAYOR-CLASSIFY-1: Mayor request type classification via prompt.
 * Run: npx tsx scripts/verify_mayor_classify_1.ts
 */
import * as fs from "fs";
import {
  ANTHROPIC_PRIMARY_MODEL,
  callAnthropicWithFallback,
} from "../lib/anthropic-models";
import { buildMayorExecutiveSystemPrompt } from "../lib/mayor-persona";
import { parseMayorAgentRoutingEnvelope } from "../lib/mayor-routing";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

function containsIgnoreCase(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle.toLowerCase());
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((n) => containsIgnoreCase(text, n));
}

function containsNone(text: string, needles: string[]): boolean {
  return !needles.some((n) => containsIgnoreCase(text, n));
}

async function askMayor(question: string, hint?: string): Promise<string> {
  const systemPrompt = buildMayorExecutiveSystemPrompt([], { clarifyAllowed: false });
  const userPrompt = `User question:\n${question}\n\n${hint ?? "Classify the request type per Mayor prompt rules, then answer. Use routing.action \"answer_self\" unless delegation is clearly required. Respond with ONE JSON object only per the contract."}`;

  const { answer: raw } = await callAnthropicWithFallback(
    ANTHROPIC_PRIMARY_MODEL,
    userPrompt,
    {
      temperature: 0,
      maxTokens: 1536,
      systemPrompt,
    },
  );

  const envelope = parseMayorAgentRoutingEnvelope(raw, []);
  return envelope.answer ?? raw;
}

type ClassifyCase = {
  label: string;
  question: string;
  mustContain?: string[];
  mustNotContain?: string[];
  hint?: string;
};

const CASES: ClassifyCase[] = [
  {
    label: "normal_chat — Что у нас дальше?",
    question: "Что у нас дальше?",
    mustNotContain: ["Needs code audit"],
  },
  {
    label: "system_status_question — RAG реализован?",
    question: "RAG реализован?",
    mustContain: ["Planned"],
    hint: 'Apply system_status_question + Reality Status Policy. Include label "Planned" in answer.',
  },
  {
    label: "code_audit — Где код usage logging?",
    question: "Где находится код usage logging?",
    mustContain: ["Needs code audit", "Tech Department", "Технический отдел", "проверк"],
  },
  {
    label: "coding_task — Поменяй код…",
    question: "Поменяй код чтобы Mayor логировал все вызовы",
    mustContain: [
      "Tech Department",
      "Технический отдел",
      "Codex",
      "engineering",
      "brief",
      "запрос",
      "задач",
    ],
    mustNotContain: ["изменил", "обновил", "починил", "задеплоил"],
  },
  {
    label: "document_lookup — ADR Mutation Engine",
    question: "Найди ADR по Mutation Engine",
    mustContain: ["ADR", "Mutation Engine", "RAG", "документ", "knowledge", "memory"],
  },
  {
    label: "architecture_decision — unified memory design",
    question: "Как лучше спроектировать unified memory?",
    mustContain: [
      "memory",
      "памят",
      "Debate",
      "архитект",
      "подход",
      "design",
      "unified",
    ],
  },
];

function staticChecks() {
  const prompt = buildMayorExecutiveSystemPrompt([], { clarifyAllowed: false });
  record("prompt contains request type classification", prompt.includes("Request type classification"));
  record("prompt defines normal_chat", prompt.includes("normal_chat"));
  record("prompt defines code_audit behavior", prompt.includes("code_audit"));
  record("prompt defines coding_task forbidden claims", prompt.includes("изменил"));
  const source = fs.readFileSync("lib/mayor-persona.ts", "utf8");
  record("no separate classifier module required", !fs.existsSync("lib/mayor-request-classifier.ts"));
  record("classification lives in mayorRoutingRules", source.includes("mayorRequestTypeClassification"));
}

async function runCases() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    record("ANTHROPIC_API_KEY present for LLM cases", false, "missing key");
    return;
  }

  for (const testCase of CASES) {
    const answer = await askMayor(testCase.question, testCase.hint);
    const normalized = answer.trim();

    let ok = true;
    const failures: string[] = [];

    if (testCase.mustContain?.length && !containsAny(normalized, testCase.mustContain)) {
      ok = false;
      failures.push(`expected one of: ${testCase.mustContain.join(", ")}`);
    }

    if (testCase.mustNotContain?.length && !containsNone(normalized, testCase.mustNotContain)) {
      ok = false;
      failures.push(`must not contain any of: ${testCase.mustNotContain.join(", ")}`);
    }

    record(testCase.label, ok, ok ? undefined : { failures, answer: normalized });
  }
}

async function main() {
  staticChecks();
  await runCases();
  console.log(process.exitCode === 1 ? "\nSome checks FAILED" : "\nAll checks PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
