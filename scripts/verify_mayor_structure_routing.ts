/**
 * Verify Mayor structure-command gate + semantic routing cases.
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolveRoutingDecision } from "../lib/mayor-routing";
import { isStructureMutationCommand } from "../lib/structure-command-intent";
import { TECH_DEPARTMENT_BUILDING_ID } from "../lib/workspace/tech-department";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const LAWYERS_BUILDING_ID = "99a8efff-d39d-4130-8553-7dada4c07b1a";

const CASES = [
  {
    name: "DMV в юристах",
    text: "В отделе юристы создай новый отдел который называется DMV в Калифорнии",
    expect: "tech" as const,
  },
  {
    name: "промты для видео",
    text: "Создай-ка в проекте city зли отдел который отвечает за промты для видео, нужно посадить двух агентов один бесплатный один дешёвый",
    expect: "tech" as const,
  },
  {
    name: "почему не работает роутинг",
    text: "почему не работает роутинг в Citizly",
    expect: "not_tech" as const,
  },
  {
    name: "какая дата суда",
    text: "какая дата суда",
    expect: "lawyers" as const,
  },
  {
    name: "сленг без keyword-gate (запилить секцию)",
    text: "запилить секцию для видео в city с двумя ботами",
    expect: "tech_llm" as const,
  },
];

function labelDecision(target: string | undefined): string {
  if (target === TECH_DEPARTMENT_BUILDING_ID) return "Tech Dept";
  if (target === LAWYERS_BUILDING_ID) return "ЮРИСТЫ";
  return target ?? "(none/answer_self)";
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: buildings } = await supabase
    .from("entity_registry")
    .select("id, name, routing_description")
    .eq("entity_type", "building");

  const lawyers = (buildings ?? []).find((b) => b.id === LAWYERS_BUILDING_ID);
  if (!lawyers) {
    console.warn("Warning: ЮРИСТЫ building not found in DB, lawyers case may fail");
  }

  console.log("=== Mayor structure routing verification ===\n");

  let passed = 0;
  for (const testCase of CASES) {
    const structureGate = isStructureMutationCommand(testCase.text);
    const decision = await resolveRoutingDecision(testCase.text, buildings ?? []);
    const routedTo = labelDecision(decision.target);

    let ok = false;
    const isStructureDelegate =
      decision.matchedBy === "structure_command" ||
      decision.matchedBy === "structure_command_llm";

    if (testCase.expect === "tech") {
      ok =
        decision.matchedBy === "structure_command" &&
        decision.target === TECH_DEPARTMENT_BUILDING_ID;
    } else if (testCase.expect === "tech_llm") {
      ok =
        !structureGate &&
        decision.matchedBy === "structure_command_llm" &&
        decision.target === TECH_DEPARTMENT_BUILDING_ID;
    } else if (testCase.expect === "not_tech") {
      ok = !isStructureDelegate && decision.target !== TECH_DEPARTMENT_BUILDING_ID;
    } else if (testCase.expect === "lawyers") {
      ok =
        !isStructureDelegate &&
        decision.action === "delegate" &&
        decision.target === LAWYERS_BUILDING_ID;
    }

    console.log(`[${ok ? "PASS" : "FAIL"}] ${testCase.name}`);
    console.log(`  text: ${testCase.text.slice(0, 80)}${testCase.text.length > 80 ? "…" : ""}`);
    console.log(`  structure_gate: ${structureGate}`);
    console.log(`  action: ${decision.action}, matchedBy: ${decision.matchedBy}`);
    console.log(`  target: ${routedTo}`);
    console.log(`  expected: ${testCase.expect}`);
    console.log("");

    if (ok) passed += 1;
  }

  console.log(`Result: ${passed}/${CASES.length} passed`);
  if (passed !== CASES.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
