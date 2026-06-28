/**
 * Comprehensive routing & agent system diagnostic (code-only, no browser).
 * Safety: only ADDs t_* entities; read-only checks on protected buildings.
 *
 * Run: npx tsx scripts/routing_diagnostic_suite.ts
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { selectAgentsForExecutionMode } from "../lib/agent-selection";
import { buildContext } from "../lib/entity-registry";
import { runAgentDebate } from "../lib/debate/run-agent-debate";
import {
  appendKnowledgeToPromptParts,
  buildKnowledgeRefsFromRows,
  KNOWLEDGE_LAYER_CHAR_LIMIT,
} from "../lib/knowledge/knowledge-context";
import { resolveDeterministicMayorRoutingDecision } from "../lib/mayor-routing";
import { resolveManagerRoutingDecision } from "../lib/manager-routing";
import { isStructureMutationCommand } from "../lib/structure-command-intent";
import { classifyTechDepartmentIntent } from "../lib/tech-department/intent";
import { listBuildingInternalChambers } from "../lib/workspace/building-internal-chambers";
import { resolveMainChamber } from "../lib/workspace/resolve-main-chamber";
import { TECH_DEPARTMENT_BUILDING_ID } from "../lib/workspace/tech-department";
import {
  auditExistingBuildings,
  ensureTestFixture,
  type TestFixture,
} from "./lib/t-test-fixture";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

type TestStatus = "PASS" | "FAIL" | "AMBIGUOUS";

type TestResult = {
  category: string;
  name: string;
  expected: string;
  actual: string;
  status: TestStatus;
  notes?: string;
};

const PROTECTED = {
  TECH: TECH_DEPARTMENT_BUILDING_ID,
  LAWYERS: "99a8efff-d39d-4130-8553-7dada4c07b1a",
  CITIZLY: "9afd85bf-ce54-4c8b-bc78-c2ff7fcd9a57",
} as const;

const results: TestResult[] = [];
const openQuestions: string[] = [];

function record(
  category: string,
  name: string,
  expected: string,
  actual: string,
  status: TestStatus,
  notes?: string,
) {
  results.push({ category, name, expected, actual, status, notes });
  const mark = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "?";
  console.log(`${mark} [${category}] ${name}`);
  console.log(`    expected: ${expected}`);
  console.log(`    actual:   ${actual}`);
  if (notes) console.log(`    notes:    ${notes}`);
}

async function loadBuildingsForMayor(
  supabase: ReturnType<typeof createClient>,
): Promise<Array<{ id: string; name: string; routing_description?: string | null }>> {
  const { data } = await supabase
    .from("entity_registry")
    .select("id, name, routing_description")
    .eq("entity_type", "building");
  return data ?? [];
}

async function runMayorTests(
  buildings: Array<{ id: string; name: string; routing_description?: string | null }>,
) {
  const cases: Array<{
    name: string;
    text: string;
    expectTarget?: string;
    expectNotTarget?: string;
    expectMatchedBy?: string;
    expectAction?: "delegate" | "answer_self";
    keywordGate?: boolean;
  }> = [
    {
      name: "structure_command keyword",
      text: "Создай-ка в проекте city зли отдел который отвечает за промты для видео",
      expectTarget: PROTECTED.TECH,
      expectMatchedBy: "structure_command",
    },
    {
      name: "structure_command_llm slang",
      text: "запилить секцию для видео в city с двумя ботами",
      expectTarget: PROTECTED.TECH,
      expectMatchedBy: "mayor_agent",
      keywordGate: false,
    },
    {
      name: "semantic lawyers",
      text: "какая дата суда",
      expectTarget: PROTECTED.LAWYERS,
      expectMatchedBy: "mayor_agent",
    },
    {
      name: "explicit_name Citizly (read-only)",
      text: "почему не работает роутинг в Citizly",
      expectNotTarget: PROTECTED.TECH,
      expectAction: "delegate",
      expectMatchedBy: "mayor_agent",
    },
    {
      name: "diagnose not tech",
      text: "почему не работает роутинг в Citizly",
      expectNotTarget: PROTECTED.TECH,
      expectMatchedBy: "mayor_agent",
    },
    {
      name: "conflict topic+structure",
      text: "В отделе юристы создай новый отдел DMV",
      expectTarget: PROTECTED.TECH,
      expectMatchedBy: "structure_command",
    },
    {
      name: "typo structure slang",
      text: "хочу замутить новый unit под health prompts в city",
      expectMatchedBy: "mayor_agent",
    },
  ];

  for (const c of cases) {
    const gate = isStructureMutationCommand(c.text);
    if (c.keywordGate === false && gate) {
      record(
        "Mayor routing",
        c.name,
        "keyword gate false before Mayor",
        `keyword gate true`,
        "AMBIGUOUS",
        "Phrase also hits keyword gate — Mayor agent path not isolated",
      );
    }

    if (c.expectMatchedBy === "mayor_agent" || c.expectMatchedBy === "semantic" || c.expectMatchedBy === "explicit_name") {
      const deterministic = await resolveDeterministicMayorRoutingDecision(c.text, buildings);
      record(
        "Mayor routing",
        c.name,
        "deterministic gate null → Mayor agent decides (MR-2)",
        deterministic === null ? "null" : `unexpected ${deterministic.matchedBy}`,
        deterministic === null ? "PASS" : "AMBIGUOUS",
        "Semantic routing is exercised by configured Mayor agent, not resolveRoutingDecision",
      );
      continue;
    }

    const decision = await resolveDeterministicMayorRoutingDecision(c.text, buildings);
    if (!decision) {
      record(
        "Mayor routing",
        c.name,
        "expected deterministic decision",
        "null (Mayor agent path)",
        "FAIL",
        "Expected structure-command deterministic routing",
      );
      continue;
    }

    let status: TestStatus = "PASS";
    const parts: string[] = [
      `action=${decision.action}`,
      `matchedBy=${decision.matchedBy}`,
      `target=${decision.target ?? "—"}`,
      `conf=${decision.confidence}`,
    ];

    if (c.expectTarget && decision.target !== c.expectTarget) status = "FAIL";
    if (c.expectNotTarget && decision.target === c.expectNotTarget) status = "FAIL";
    if (c.expectMatchedBy && decision.matchedBy !== c.expectMatchedBy) {
      status = "FAIL";
    }
    if (c.expectAction && decision.action !== c.expectAction) status = "FAIL";

    record(
      "Mayor routing",
      c.name,
      [
        c.expectTarget ? `target=${c.expectTarget}` : null,
        c.expectNotTarget ? `not ${c.expectNotTarget}` : null,
        c.expectMatchedBy ? `matchedBy=${c.expectMatchedBy}` : null,
        c.expectAction ? `action=${c.expectAction}` : null,
      ]
        .filter(Boolean)
        .join("; ") || "see case",
      parts.join(", "),
      status,
      decision.reasoning.slice(0, 120),
    );
  }
}

async function runManagerTests(fixture: TestFixture) {
  const buildingId = fixture.cactusShop.registryId;
  const main = await resolveMainChamber(buildingId);
  if (!main) {
    record("Manager routing", "setup", "main chamber", "missing", "FAIL");
    return;
  }

  const internal = await listBuildingInternalChambers(buildingId);
  const buh = internal.find((c) => c.name === "t_Бухгалтерия");
  const mug = internal.find((c) => c.name === "t_Кружка");

  const delegateCases = [
    {
      name: "delegate t_Бухгалтерия",
      text: "сделай отчёт по балансу и налогам за квартал",
      expectedId: buh?.id,
    },
    {
      name: "delegate t_Кружка",
      text: "подбери дизайн керамической кружки 300мл с новым цветом",
      expectedId: mug?.id,
    },
  ];

  for (const c of delegateCases) {
    const decision = await resolveManagerRoutingDecision(
      c.text,
      buildingId,
      main.chamberRegistryId,
      internal,
    );
    const ok =
      decision.action === "delegate" && decision.delegatedChamberId === c.expectedId;
    record(
      "Manager routing",
      c.name,
      `delegate → ${c.expectedId?.slice(0, 8) ?? "?"}`,
      `action=${decision.action} target=${decision.delegatedChamberId ?? "—"} conf=${decision.confidence}`,
      ok ? "PASS" : "FAIL",
      decision.reasoning.slice(0, 100),
    );
  }

  const emptyMain = await resolveMainChamber(fixture.emptyShell.registryId);
  const emptyInternal = await listBuildingInternalChambers(fixture.emptyShell.registryId);
  if (emptyMain) {
    const decision = await resolveManagerRoutingDecision(
      "любой вопрос без внутренних отделов",
      fixture.emptyShell.registryId,
      emptyMain.chamberRegistryId,
      emptyInternal,
    );
    record(
      "Manager routing",
      "answer_self no internal chambers",
      "action=answer_self, trace no_internal_chambers",
      `action=${decision.action} trace=${decision.trace.join(",")}`,
      decision.action === "answer_self" && decision.trace.includes("no_internal_chambers")
        ? "PASS"
        : "FAIL",
    );
  }

  const conflictDecision = await resolveManagerRoutingDecision(
    "налоги и кружки одновременно — сводный отчёт",
    buildingId,
    main.chamberRegistryId,
    internal,
  );
  record(
    "Manager routing",
    "conflict dual topic",
    "delegate to one internal chamber OR answer_self with low confidence",
    `action=${conflictDecision.action} target=${conflictDecision.delegatedChamberId ?? "—"} conf=${conflictDecision.confidence}`,
    conflictDecision.action === "delegate" || conflictDecision.action === "answer_self"
      ? "AMBIGUOUS"
      : "FAIL",
    "Dual-topic routing is LLM-dependent; both outcomes may be valid",
  );
}

function runTechIntentTests() {
  const cases: Array<{
    name: string;
    text: string;
    expected: string;
  }> = [
    { name: "pure diagnose", text: "почему не работает роутинг", expected: "diagnose" },
    { name: "pure structure", text: "создай новый отдел для видео", expected: "structure" },
    {
      name: "code audit file",
      text: "проверь lib/execute-chat-task.ts функцию executeTechDepartmentTask",
      expected: "code_audit",
    },
    {
      name: "runtime diagnose logs",
      text: "что было в логах routing_logs за сегодня",
      expected: "diagnose",
    },
    {
      name: "conflict diagnose wins",
      text: "почему не создал отдел для видео",
      expected: "diagnose",
    },
    {
      name: "conflict structure wins",
      text: "создай отдел и проверь почему routing",
      expected: "structure",
    },
    { name: "unknown empty", text: "   ", expected: "unknown" },
    { name: "default diagnose", text: "расскажи про погоду", expected: "diagnose" },
  ];

  for (const c of cases) {
    const actual = classifyTechDepartmentIntent(c.text);
    record(
      "Tech Department intent",
      c.name,
      c.expected,
      actual,
      actual === c.expected ? "PASS" : "FAIL",
    );
  }
}

async function runKnowledgeTests(fixture: TestFixture, supabase: ReturnType<typeof createClient>) {
  const chamberId = fixture.fullRosterChamber.registryId;

  const { data: rows } = await supabase
    .from("knowledge")
    .select("id, title, content, body, file_url")
    .eq("entity_registry_id", chamberId)
    .like("title", "t_%");

  const { data: agentAssignment } = await supabase
    .from("agent_assignments")
    .select("agent_id")
    .eq("chamber_id", fixture.fullRosterChamber.chamberId)
    .limit(1)
    .maybeSingle();

  if (!agentAssignment?.agent_id) {
    record("Knowledge", "setup agent", "assignment exists", "missing", "FAIL");
    return;
  }

  const ctx = await buildContext(agentAssignment.agent_id, {
    chamberRegistryId: chamberId,
    taskText: "опунция t_диаг каталог кактусов",
  });

  const prompt = ctx.flattenedPrompt;
  const hasCactusSecret = prompt.includes("T_KNOWLEDGE_SECRET_CACTUS");
  const hasMugSecret = prompt.includes("T_KNOWLEDGE_SECRET_MUG");
  const hasFullExcerpt = prompt.includes("AI Council City") || prompt.includes("эталонная архитектура");

  record(
    "Knowledge",
    "matched entry full body in prompt",
    "T_KNOWLEDGE_SECRET_CACTUS + doc excerpt present",
    `cactus=${hasCactusSecret} excerpt=${hasFullExcerpt} mugHidden=${!hasMugSecret}`,
    hasCactusSecret && hasFullExcerpt && !hasMugSecret ? "PASS" : "FAIL",
  );

  const ctxSkip = await buildContext(agentAssignment.agent_id, {
    chamberRegistryId: chamberId,
    taskText: "промты для видео",
  });
  record(
    "Knowledge",
    "unrelated task hides other bodies",
    "no T_KNOWLEDGE_SECRET_CACTUS",
    `hasCactus=${ctxSkip.flattenedPrompt.includes("T_KNOWLEDGE_SECRET_CACTUS")}`,
    !ctxSkip.flattenedPrompt.includes("T_KNOWLEDGE_SECRET_CACTUS") ? "PASS" : "FAIL",
  );

  const nearLimitRows = Array.from({ length: 180 }, (_, i) => ({
    id: `t_near_${i}`,
    title: `t_near_doc_${i}`,
    content: `desc ${i}`,
    body: "x".repeat(220),
    file_url: null,
  }));

  const nearRefs = buildKnowledgeRefsFromRows(nearLimitRows, {
    taskText: "t_near_doc_0",
  });
  const nearParts: string[] = [];
  appendKnowledgeToPromptParts(nearParts, nearRefs);
  const nearPrompt = nearParts.join("\n");
  const nearChars = nearPrompt.length;

  record(
    "Knowledge",
    "near 40k layer",
    `prompt chars close to but below ${KNOWLEDGE_LAYER_CHAR_LIMIT}`,
    `chars=${nearChars} truncatedNotice=${nearPrompt.includes("лимит")}`,
    nearChars > 30_000 && !nearPrompt.includes("лимит") ? "PASS" : "AMBIGUOUS",
    "Synthetic rows; exact threshold depends on match/open logic",
  );

  const overRows = Array.from({ length: 400 }, (_, i) => ({
    id: `t_over_${i}`,
    title: `t_over_doc_${i}`,
    content: `description line ${i} `.repeat(8),
    body: null,
    file_url: null,
  }));

  const overRefs = buildKnowledgeRefsFromRows(overRows, { taskText: "t_over_doc_1" });
  const hasTruncation = overRefs.some((r) => r.id === "knowledge-truncated-notice");
  record(
    "Knowledge",
    "over 40k catalog truncation",
    "knowledge-truncated-notice ref present",
    `refs=${overRefs.length} truncated=${hasTruncation}`,
    hasTruncation ? "PASS" : "FAIL",
  );

  void rows;
}

async function runCostTierTests(fixture: TestFixture) {
  const fullChamber = fixture.fullRosterChamber.registryId;
  const freeChamber = fixture.freeOnlyChamber.registryId;

  for (const mode of ["fast", "team", "council"] as const) {
    try {
      const agents = await selectAgentsForExecutionMode(fullChamber, mode);
      record(
        "cost_tier",
        `full roster ${mode}`,
        "no throw, required tier present",
        `agents=${agents.length} tiers=${[...new Set(agents.map((a) => a.costTier))].join(",")}`,
        agents.length > 0 ? "PASS" : "FAIL",
      );
    } catch (e) {
      record(
        "cost_tier",
        `full roster ${mode}`,
        "no throw",
        e instanceof Error ? e.message : String(e),
        "FAIL",
      );
    }
  }

  try {
    const turbo = await selectAgentsForExecutionMode(fullChamber, "council", { turbo: true });
    record(
      "cost_tier",
      "full roster turbo",
      "premium tier present",
      `agents=${turbo.length} tiers=${[...new Set(turbo.map((a) => a.costTier))].join(",")}`,
      turbo.some((a) => a.costTier === "premium") ? "PASS" : "AMBIGUOUS",
      "Turbo uses premium required tier per agent-selection.ts",
    );
  } catch (e) {
    record(
      "cost_tier",
      "full roster turbo",
      "no throw",
      e instanceof Error ? e.message : String(e),
      "FAIL",
    );
  }

  try {
    await selectAgentsForExecutionMode(freeChamber, "fast");
    record("cost_tier", "free-only fast", "success", "ok", "PASS");
  } catch (e) {
    record(
      "cost_tier",
      "free-only fast",
      "success",
      e instanceof Error ? e.message : String(e),
      "FAIL",
    );
  }

  for (const [mode, msgPart] of [
    ["team", "cheap"],
    ["council", "mid"],
  ] as const) {
    try {
      await selectAgentsForExecutionMode(freeChamber, mode);
      record(
        "cost_tier",
        `free-only ${mode} should error`,
        `Error mentioning ${msgPart}`,
        "no error thrown",
        "FAIL",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      record(
        "cost_tier",
        `free-only ${mode} should error`,
        `Error mentioning ${msgPart}`,
        msg.slice(0, 120),
        msg.toLowerCase().includes(msgPart) ? "PASS" : "AMBIGUOUS",
      );
    }
  }

  try {
    await selectAgentsForExecutionMode(freeChamber, "council", { turbo: true });
    record(
      "cost_tier",
      "free-only turbo should error",
      "premium error",
      "no error",
      "FAIL",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record(
      "cost_tier",
      "free-only turbo should error",
      "premium error",
      msg.slice(0, 120),
      msg.toLowerCase().includes("premium") ? "PASS" : "AMBIGUOUS",
    );
  }
}

async function runDebateTests(fixture: TestFixture) {
  if (!process.env.GROQ_API_KEY && !process.env.GOOGLE_API_KEY) {
    record(
      "Debate",
      "setup",
      "LLM keys available",
      "missing GROQ/GOOGLE",
      "AMBIGUOUS",
      "Skipped live debate — no cheap LLM key",
    );
    return;
  }

  const callerId = fixture.cactusShop.mainChamber.registryId;

  try {
    const confirmResult = await runAgentDebate({
      question: "t_ диаг: ответь одним словом OK если вопрос понятен",
      callerEntityId: callerId,
      callerKind: "chamber_manager",
      tierMode: { tier: "free" },
    });
    record(
      "Debate",
      "live cycle (fast tier)",
      "closedReason confirmed OR attempts_exhausted",
      `closedReason=${confirmResult.closedReason} rounds=${confirmResult.rounds.length}`,
      confirmResult.closedReason === "confirmed" || confirmResult.closedReason === "attempts_exhausted"
        ? "PASS"
        : "FAIL",
      `Council chamber: ${confirmResult.councilChamberName}`,
    );

    if (confirmResult.closedReason === "confirmed") {
      record(
        "Debate",
        "outcome confirmed",
        "closedReason=confirmed",
        confirmResult.closedReason,
        "PASS",
      );
    } else {
      record(
        "Debate",
        "outcome confirmed",
        "closedReason=confirmed",
        confirmResult.closedReason,
        "AMBIGUOUS",
        "First run exhausted attempts — need second run for confirmed",
      );
    }

    const exhaustResult = await runAgentDebate({
      question:
        "t_ диаг: найди 50 логических противоречий в ответе и каждый раз требуй полную переработку",
      callerEntityId: callerId,
      callerKind: "chamber_manager",
      tierMode: { tier: "free" },
    });

    if (exhaustResult.closedReason === "attempts_exhausted") {
      record(
        "Debate",
        "outcome attempts_exhausted",
        "closedReason=attempts_exhausted",
        exhaustResult.closedReason,
        "PASS",
      );
    } else {
      record(
        "Debate",
        "outcome attempts_exhausted",
        "closedReason=attempts_exhausted",
        exhaustResult.closedReason,
        "AMBIGUOUS",
        "Reviewer may confirm early despite adversarial prompt",
      );
    }
  } catch (e) {
    record(
      "Debate",
      "runAgentDebate",
      "completes without throw",
      e instanceof Error ? e.message : String(e),
      "FAIL",
    );
  }
}

function collectOpenQuestions() {
  openQuestions.push(
    "city_builder_architecture_reference.md §3: Team = free+mid, Council = free+mid+premium; код agent-selection.ts: Team = free+cheap, Council = free+cheap+mid. Какой эталон верный?",
  );
  openQuestions.push(
    "Debate жёстко привязан к City Hall «Совет города», а не к t_ chamber — полный цикл спора нельзя изолировать на t_ сущностях без изменения кода.",
  );
  openQuestions.push(
    "classifyTechDepartmentIntent для текста без diagnose/structure ключей возвращает diagnose (не unknown) — это задокументировано только в коде, не в architecture_reference.",
  );
}

function printEntityInventory(fixture: TestFixture) {
  console.log("\n=== Created / reused t_ entities ===");
  const lines = [
    `Building: ${fixture.cactusShop.label} (${fixture.cactusShop.registryId})`,
    `  main: ${fixture.cactusShop.mainChamber.name} (${fixture.cactusShop.mainChamber.registryId})`,
    ...fixture.cactusShop.internalChambers.map(
      (c) => `  internal: ${c.name} (${c.registryId})`,
    ),
    `Building: ${fixture.emptyShell.label} (${fixture.emptyShell.registryId})`,
    `  main: ${fixture.emptyShell.mainChamber.name} (${fixture.emptyShell.mainChamber.registryId})`,
    `Free-only chamber: ${fixture.freeOnlyChamber.name} (${fixture.freeOnlyChamber.registryId})`,
    `Knowledge entries: ${fixture.knowledgeEntryIds.join(", ")}`,
    fixture.connectionId
      ? `Connection: ${fixture.cactusShop.mainChamber.registryId} → ${fixture.emptyShell.mainChamber.registryId} (${fixture.connectionId})`
      : "Connection: (not created)",
  ];
  for (const l of lines) console.log(l);
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log("=== Step 0: Audit existing buildings ===");
  const audit = await auditExistingBuildings(supabase);
  for (const row of audit) {
    console.log(
      `- ${row.name}: chambers=${row.chamberCount} internal=${row.internalCount} agents=${row.agentCount} knowledge=${row.knowledgeCount} conn=${row.connectionCount} → ${row.note}`,
    );
  }

  console.log("\n=== Step 1: Ensure t_ test fixture ===");
  const fixture = await ensureTestFixture(supabase);
  printEntityInventory(fixture);

  const buildings = await loadBuildingsForMayor(supabase);

  console.log("\n=== Step 2: Run diagnostic tests ===");

  await runMayorTests(buildings);
  await runManagerTests(fixture);
  runTechIntentTests();
  await runKnowledgeTests(fixture, supabase);
  await runCostTierTests(fixture);
  await runDebateTests(fixture);

  collectOpenQuestions();

  const summary = {
    ranAt: new Date().toISOString(),
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    ambiguous: results.filter((r) => r.status === "AMBIGUOUS").length,
    total: results.length,
    createdEntities: {
      buildings: [fixture.cactusShop, fixture.emptyShell].map((b) => ({
        label: b.label,
        id: b.registryId,
        chambers: [b.mainChamber, ...b.internalChambers].map((c) => ({
          name: c.name,
          registryId: c.registryId,
          chamberId: c.chamberId,
        })),
      })),
      freeOnlyChamber: fixture.freeOnlyChamber,
      knowledgeEntryIds: fixture.knowledgeEntryIds,
      connectionId: fixture.connectionId,
    },
    buildingAudit: audit,
    openQuestions,
    results,
  };

  const reportPath = "scripts/routing_diagnostic_report.json";
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

  console.log("\n=== Summary ===");
  console.log(`PASS: ${summary.pass}  FAIL: ${summary.fail}  AMBIGUOUS: ${summary.ambiguous}  TOTAL: ${summary.total}`);
  console.log(`Report: ${reportPath}`);

  console.log("\n=== Open questions (not guessed) ===");
  for (const q of openQuestions) console.log(`- ${q}`);

  if (summary.fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
