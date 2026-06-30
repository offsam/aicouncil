/**
 * MAYOR-QUALITY-1: Reality Status Policy — prompt + direct Mayor LLM behavior.
 * Run: npx tsx scripts/verify_mayor_quality_1.ts
 */
import * as fs from "fs";
import {
  ANTHROPIC_PRIMARY_MODEL,
  callAnthropicWithFallback,
} from "../lib/anthropic-models";
import {
  buildMayorExecutiveSystemPrompt,
  MAYOR_REALITY_STATUS_BOOTSTRAP_LIST,
} from "../lib/mayor-persona";
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

async function askMayor(question: string): Promise<string> {
  const systemPrompt = buildMayorExecutiveSystemPrompt([], { clarifyAllowed: false });
  const userPrompt = `User question:\n${question}\n\nThis is a capability/status question. Use routing.action "answer_self". In "answer", include exactly one Reality Status Policy label (Implemented, Partially implemented, Planned, Unknown, or Needs code audit). Respond with ONE JSON object only per the contract.`;

  const { answer: raw } = await callAnthropicWithFallback(
    ANTHROPIC_PRIMARY_MODEL,
    userPrompt,
    {
      temperature: 0,
      maxTokens: 1024,
      systemPrompt,
    },
  );

  const envelope = parseMayorAgentRoutingEnvelope(raw, []);
  return envelope.answer ?? raw;
}

type LlmCase = {
  label: string;
  question: string;
  mustContain?: string[];
  mustNotContain?: string[];
};

const LLM_CASES: LlmCase[] = [
  {
    label: "RAG реализован? → Planned (not Implemented/working)",
    question: "RAG реализован?",
    mustContain: ["Planned"],
    mustNotContain: ["Implemented", "working"],
  },
  {
    label: "GitHub Connector работает? → Planned",
    question: "GitHub Connector работает?",
    mustContain: ["Planned"],
  },
  {
    label: "Debate реализован? → Implemented",
    question: "Debate реализован?",
    mustContain: ["Implemented"],
  },
  {
    label: "Usage logging работает? → Implemented",
    question: "Usage logging работает?",
    mustContain: ["Implemented"],
  },
  {
    label: "Где код usage logging? → Needs code audit / Tech Department / Unknown",
    question: "Где находится код usage logging?",
    mustContain: ["Needs code audit", "Tech Department", "Unknown"],
  },
];

function staticChecks() {
  const prompt = buildMayorExecutiveSystemPrompt([], { clarifyAllowed: false });
  record("prompt contains Reality Status Policy", prompt.includes("Reality Status Policy:"));
  record(
    "prompt marks bootstrap list as temporary",
    prompt.includes("NOT permanent source of truth") &&
      prompt.includes("replace with live verification"),
  );
  record(
    "MAYOR_REALITY_STATUS_BOOTSTRAP_LIST exported",
    MAYOR_REALITY_STATUS_BOOTSTRAP_LIST.includes("RAG / embeddings / pgvector — Planned"),
  );

  const source = fs.readFileSync("lib/mayor-persona.ts", "utf8");
  record(
    "code comment marks bootstrap as temporary",
    source.includes("Temporary bootstrap context") &&
      source.includes("NOT permanent source of truth"),
  );
}

async function runLlmCases() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    record("ANTHROPIC_API_KEY present for LLM cases: cases", false, "missing key");
    return;
  }

  for (const testCase of LLM_CASES) {
    const answer = await askMayor(testCase.question);
    const normalized = answer.trim();

    let ok = true;
    const failures: string[] = [];

    if (testCase.mustContain?.length) {
      const anyRequired = testCase.mustContain.some((needle) =>
        containsIgnoreCase(normalized, needle),
      );
      if (!anyRequired) {
        ok = false;
        failures.push(`expected one of: ${testCase.mustContain.join(", ")}`);
      }
    }

    for (const forbidden of testCase.mustNotContain ?? []) {
      if (containsIgnoreCase(normalized, forbidden)) {
        ok = false;
        failures.push(`must not contain: ${forbidden}`);
      }
    }

    record(
      testCase.label,
      ok,
      ok ? undefined : { failures, answer: normalized },
    );
  }
}

async function main() {
  staticChecks();
  await runLlmCases();
  console.log(process.exitCode === 1 ? "\nSome checks FAILED" : "\nAll checks PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
