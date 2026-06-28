/**
 * MR-2: Verify Mayor routing envelope parser + deterministic structure gate.
 * Run: npx tsx scripts/verify_mayor_routing_parser.ts
 */
import * as fs from "fs";
import {
  finalizeMayorRoutingDecision,
  parseMayorAgentRoutingEnvelope,
  resolveDeterministicMayorRoutingDecision,
} from "../lib/mayor-routing";
import { TECH_DEPARTMENT_BUILDING_ID } from "../lib/workspace/tech-department";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const LAWYERS = "99a8efff-d39d-4130-8553-7dada4c07b1a";
const BUILDINGS = [
  { id: TECH_DEPARTMENT_BUILDING_ID, name: "Технический отдел" },
  { id: LAWYERS, name: "ЮРИСТЫ", routing_description: "Legal" },
];

type Check = { name: string; pass: boolean; details: Record<string, unknown> };
const checks: Check[] = [];

function record(name: string, pass: boolean, details: Record<string, unknown>) {
  checks.push({ name, pass, details });
  console.log(pass ? "PASS" : "FAIL", name);
  console.log(JSON.stringify(details, null, 2));
}

async function main() {
  const structure = await resolveDeterministicMayorRoutingDecision(
    "создай новый отдел для видео",
    BUILDINGS,
  );
  record("deterministic structure gate → Tech", structure?.matchedBy === "structure_command" && structure?.target === TECH_DEPARTMENT_BUILDING_ID, {
    matchedBy: structure?.matchedBy,
    target: structure?.target,
  });

  const nonStructure = await resolveDeterministicMayorRoutingDecision(
    "какая дата суда",
    BUILDINGS,
  );
  record("non-structure returns null (Mayor decides)", nonStructure === null, {
    decision: nonStructure,
  });

  const delegateRaw = JSON.stringify({
    routing: {
      action: "delegate",
      target: LAWYERS,
      matchedBy: "semantic",
      confidence: 0.9,
      reasoning: "Legal question",
      trace: ["mayor_agent"],
    },
    answer: null,
  });
  const delegateParsed = parseMayorAgentRoutingEnvelope(delegateRaw, BUILDINGS);
  const delegateFinal = await finalizeMayorRoutingDecision(
    delegateParsed.decision,
    new Set(BUILDINGS.map((b) => b.id)),
  );
  record("parse delegate envelope", delegateFinal.action === "delegate" && delegateFinal.target === LAWYERS, {
    action: delegateFinal.action,
    target: delegateFinal.target,
    delegatedChamberId: delegateFinal.delegatedChamberId,
  });

  const answerRaw = JSON.stringify({
    routing: {
      action: "answer_self",
      matchedBy: "semantic",
      confidence: 0.95,
      reasoning: "General coordination",
      trace: ["mayor_agent"],
    },
    answer: "Краткий ответ мэра.",
  });
  const answerParsed = parseMayorAgentRoutingEnvelope(answerRaw, BUILDINGS);
  record("parse answer_self envelope", answerParsed.decision.action === "answer_self" && answerParsed.answer === "Краткий ответ мэра.", {
    action: answerParsed.decision.action,
    answer: answerParsed.answer,
  });

  const clarifyRaw = JSON.stringify({
    routing: {
      action: "clarify",
      matchedBy: "semantic",
      confidence: 0.55,
      reasoning: "Costly ambiguity",
      trace: ["mayor_agent", "clarify"],
    },
    answer: "Какое здание — ЮРИСТЫ или Citizly?",
  });
  const clarifyParsed = parseMayorAgentRoutingEnvelope(clarifyRaw, BUILDINGS);
  record(
    "parse clarify envelope",
    clarifyParsed.decision.action === "clarify" && Boolean(clarifyParsed.answer),
    { action: clarifyParsed.decision.action, answer: clarifyParsed.answer },
  );

  const badParsed = parseMayorAgentRoutingEnvelope("{ invalid json", BUILDINGS);
  record("parse error → user message", badParsed.decision.trace.includes("parse_error") && Boolean(badParsed.answer), {
    trace: badParsed.decision.trace,
    answerPreview: badParsed.answer?.slice(0, 80),
  });

  const plainParsed = parseMayorAgentRoutingEnvelope(
    "Я являюсь исполняющим обязанности мэра AI-офиса.",
    BUILDINGS,
  );
  record("plain text → answer_self fallback", plainParsed.decision.trace.includes("plain_text_fallback") && plainParsed.answer?.includes("мэра"), {
    trace: plainParsed.decision.trace,
    answer: plainParsed.answer,
  });

  const lowConf = await finalizeMayorRoutingDecision(
    {
      action: "delegate",
      target: LAWYERS,
      matchedBy: "semantic",
      confidence: 0.1,
      reasoning: "unsure",
      trace: ["mayor_agent"],
    },
    new Set(BUILDINGS.map((b) => b.id)),
  );
  record("low confidence falls back to answer_self", lowConf.action === "answer_self", {
    action: lowConf.action,
    trace: lowConf.trace,
  });

  const noMain = await finalizeMayorRoutingDecision(
    {
      action: "delegate",
      target: "f7a5bd42-6ef5-4784-a53e-035b4dd56f83",
      matchedBy: "semantic",
      confidence: 0.9,
      reasoning: "test building without main chamber",
      trace: ["mayor_agent"],
    },
    new Set(BUILDINGS.map((b) => b.id).concat(["f7a5bd42-6ef5-4784-a53e-035b4dd56f83"])),
  );
  record("no main chamber → answer_self fallback", noMain.action === "answer_self" && noMain.trace.includes("fallback_no_main_chamber"), {
    action: noMain.action,
    trace: noMain.trace,
  });

  const fakeId = await finalizeMayorRoutingDecision(
    {
      action: "delegate",
      target: "00000000-0000-4000-8000-000000000099",
      matchedBy: "semantic",
      confidence: 0.9,
      reasoning: "hallucinated uuid",
      trace: ["mayor_agent"],
    },
    new Set(BUILDINGS.map((b) => b.id)),
  );
  record("unknown building id → answer_self fallback", fakeId.action === "answer_self" && fakeId.trace.includes("fallback_invalid_or_low_confidence"), {
    action: fakeId.action,
    trace: fakeId.trace,
  });

  console.log("\n=== Summary ===");
  const passed = checks.filter((c) => c.pass).length;
  console.log(`${passed}/${checks.length} passed`);
  process.exit(checks.every((c) => c.pass) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
