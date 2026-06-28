/**
 * Verify Manager internal routing on live Citizly data.
 * Run: npx tsx scripts/verify_manager_routing.ts
 */
import * as fs from "fs";
import { executeChatTask } from "../lib/execute-chat-task";
import { resolveManagerRoutingDecision } from "../lib/manager-routing";
import {
  listBuildingInternalChambers,
  resolveBuildingRegistryIdForChamber,
} from "../lib/workspace/building-internal-chambers";
import { resolveMainChamber } from "../lib/workspace/resolve-main-chamber";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const CITIZLY_BUILDING = "9afd85bf-ce54-4c8b-bc78-c2ff7fcd9a57";
const MANAGER_CHAMBER = "79e21ee2-b4a1-4e25-9439-f358300e5d9f";
const VOProsY_CHAMBER = "d7dd05ba-73e3-45cd-a9d1-3a50015eb520";
const REELS_CHAMBER = "23386f68-6349-4665-8184-ac70bdff35d2";

const CASES = [
  {
    label: "N400 questions",
    taskText: "придумать пять вопросов про форму N400",
    expectedChamberId: VOProsY_CHAMBER,
    expectedChamberName: "Вопросы",
  },
  {
    label: "Reels description",
    taskText: "описание для Reels 30 секунд про конституцию",
    expectedChamberId: REELS_CHAMBER,
    expectedChamberName: "Описание для рилсов",
  },
] as const;

async function verifyDecisionLayer() {
  console.log("\n=== resolveManagerRoutingDecision (decision only) ===");
  const main = await resolveMainChamber(CITIZLY_BUILDING);
  const internal = await listBuildingInternalChambers(CITIZLY_BUILDING);
  console.log(
    "internal chambers:",
    internal.map((c) => `${c.name} (${c.id.slice(0, 8)}…)`).join(", "),
  );
  if (!main) throw new Error("Citizly main chamber missing");

  for (const test of CASES) {
    const decision = await resolveManagerRoutingDecision(
      test.taskText,
      CITIZLY_BUILDING,
      main.chamberRegistryId,
      internal,
    );
    const ok =
      decision.action === "delegate" && decision.delegatedChamberId === test.expectedChamberId;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${test.label}: action=${decision.action} target=${decision.delegatedChamberId ?? "—"} confidence=${decision.confidence}`,
    );
    console.log(`  reasoning: ${decision.reasoning}`);
    if (!ok) process.exitCode = 1;
  }
}

async function verifyExecuteChatTask() {
  console.log("\n=== executeChatTask via Manager (full fast path) ===");
  for (const test of CASES) {
    const result = await executeChatTask(test.taskText, MANAGER_CHAMBER, "fast", {
      sourceEntityId: MANAGER_CHAMBER,
    });
    const routedId = result.mode === "single" ? result.routing.targets[0]?.entityRegistryId : null;
    const ok = routedId === test.expectedChamberId;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${test.label}: routed to ${result.targetName ?? routedId} (${routedId?.slice(0, 8) ?? "—"}…) agent=${result.agentName}`,
    );
    console.log(`  answer preview: ${(result.mode === "single" ? result.answer : "").slice(0, 120)}…`);
    if (!ok) process.exitCode = 1;
  }
}

async function verifyBuildingLookup() {
  const buildingId = await resolveBuildingRegistryIdForChamber(MANAGER_CHAMBER);
  console.log("\n=== building lookup ===");
  console.log("Manager building:", buildingId);
  if (buildingId !== CITIZLY_BUILDING) {
    console.log("FAIL unexpected building id");
    process.exitCode = 1;
  } else {
    console.log("PASS");
  }
}

async function main() {
  await verifyBuildingLookup();
  await verifyDecisionLayer();
  await verifyExecuteChatTask();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
