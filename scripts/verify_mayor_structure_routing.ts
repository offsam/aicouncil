/**
 * Verify Mayor deterministic structure gate (MR-2).
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolveDeterministicMayorRoutingDecision } from "../lib/mayor-routing";
import { isStructureMutationCommand } from "../lib/structure-command-intent";
import {
  requireExternalEntryOfficeId,
  requireTechDepartmentBuildingId,
} from "../lib/workspace/graph-identity-required";

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
    expect: "mayor_decides" as const,
  },
  {
    name: "какая дата суда",
    text: "какая дата суда",
    expect: "mayor_decides" as const,
  },
  {
    name: "сленг без keyword-gate (Mayor decides under MR-2)",
    text: "запилить секцию для видео в city с двумя ботами",
    expect: "mayor_decides" as const,
  },
];

function labelDecision(target: string | undefined, techBuildingId: string): string {
  if (target === techBuildingId) return "Tech Dept";
  if (target === LAWYERS_BUILDING_ID) return "ЮРИСТЫ";
  return target ?? "(none/answer_self)";
}

async function main() {
  const officeId = await requireExternalEntryOfficeId();
  const techBuildingId = await requireTechDepartmentBuildingId(officeId);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: buildings } = await supabase
    .from("entity_registry")
    .select("id, name, routing_description")
    .eq("entity_type", "building");

  console.log("=== Mayor deterministic structure gate (MR-2) ===\n");

  let passed = 0;
  for (const testCase of CASES) {
    const structureGate = isStructureMutationCommand(testCase.text);
    const decision = await resolveDeterministicMayorRoutingDecision(
      testCase.text,
      buildings ?? [],
    );

    let ok = false;
    if (testCase.expect === "tech") {
      ok =
        decision?.matchedBy === "structure_command" &&
        decision.target === techBuildingId;
    } else {
      ok = decision === null;
    }

    console.log(`[${ok ? "PASS" : "FAIL"}] ${testCase.name}`);
    console.log(`  text: ${testCase.text.slice(0, 80)}${testCase.text.length > 80 ? "…" : ""}`);
    console.log(`  structure_gate: ${structureGate}`);
    console.log(`  deterministic: ${decision ? `${decision.action}/${decision.matchedBy} → ${labelDecision(decision.target, techBuildingId)}` : "null (Mayor agent decides)"}`);
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
