import type { AnalysisReport } from "./api-types";
import {
  selectAgentForChamberEntity,
  selectAgentsForExecutionMode,
  type SelectedAgent,
} from "./agent-selection";
import { invokeChamberAgentWithFreeFallback } from "./chamber-agent-invoke";
import { resolveChamberManagerAgentId } from "./chamber-manager";
import { runConsensusAnalysis } from "./consensus";
import { isExecutionMode, type ExecutionMode } from "./execution-mode";
import { resolveOfficeExecutionMode } from "./workspace/execution-mode-tiers";
import { executeParallelAgents } from "./execute-parallel-agents";
import { invokeAgentForWorkflow } from "./invoke-agent";
import { writeChamberArchiveEntry } from "./chamber-archive";
import { normalizeCostTier } from "./cost-tier";
import { GENERAL_INTAKE_ID } from "./route-agent-ids";
import { updateRoutingLogAgentCount, logMayorRoutingDecision, logDirectAgentRoutingDecision } from "./routing";
import { computeOfficeInventoryCounts } from "./office-inventory-counts";
import { formatMayorOfficeSnapshotPrompt, isOfficeInventoryCountQuestion, isSystemReadOnlyQuestion, formatMayorInventoryAnswer, OFFICE_INVENTORY_SNAPSHOT_REASONING, OFFICE_INVENTORY_SNAPSHOT_TRACE } from "./mayor-office-snapshot";
import { isStructureMutationCommand } from "./structure-command-intent";
import { resolveStructureCommandAnaphora } from "./structure-anaphora-resolver";
import { getSupabaseAdmin } from "./supabase/admin";
import type { RouteDecision, MayorRoutingDecision } from "./office-types";
import { processTask } from "./workflow-orchestrator";
import {
  finalizeMayorRoutingDecision,
  mayorRoutingLogAction,
  parseMayorAgentRoutingEnvelope,
  resolveDeterministicMayorRoutingDecision,
  resolveStructureMutationMayorRoutingDecision,
  resolveSystemReadOnlyMayorRoutingDecision,
} from "./mayor-routing";
import { resolveManagerRoutingDecision } from "./manager-routing";
import { resolveMainChamber } from "./workspace/resolve-main-chamber";
import {
  filterInternalChambersBySendTasksConnection,
  listBuildingInternalChambers,
  resolveBuildingRegistryIdForChamber,
} from "./workspace/building-internal-chambers";
import { isMainChamber } from "./workspace/is-main-chamber";
import { resolveCityHallMainAgent } from "./workspace/city-hall-orchestrator";
import {
  buildMayorExecutiveSystemPrompt,
  buildMayorExecutiveSystemPromptParts,
  MAYOR_DELEGATE_TARGET_NOT_CONFIGURED_ANSWER,
  MAYOR_ROUTING_MISSING_ANSWER,
} from "./mayor-persona";
import {
  appendMayorConversationTurn,
  loadMayorConversationHistory,
  mayorClarifyAllowed,
  mayorConversationTurnsForModel,
  trimMayorConversationTurnsForPrompt,
  type MayorConversationMessageKind,
} from "./mayor-conversation-memory";
import {
  compactMayorSharedMemoryReadView,
  loadMayorSharedMemory,
  scheduleMayorSharedMemoryUpdate,
} from "./mayor-shared-memory";
import { sanitizeUserFacingText, toUserFacingProviderError } from "./provider-user-error";
import { assertAgentContextAccess } from "./security/agent-context-access";
import { buildManagerSummaryPrompt } from "./agent-persona";
import { invokeCheapLLM } from "./cheap-llm";
import { runWithLlmUsageContext } from "./llm-usage-context";
import { isMayorAgent as isMayorAgentByGraph } from "./workspace/graph-identity";
import {
  requireExternalEntryOfficeId,
  requireTechDepartmentBuildingId,
  requireTechDepartmentMainChamberRegistryId,
} from "./workspace/graph-identity-required";
import { classifyTechDepartmentIntent } from "./tech-department/intent";
import {
  CHAT_COMPOUND_DESTRUCTIVE_CREATE_ANSWER,
  hasCompoundDestructiveCreateStructureIntent,
  hasDestructiveStructureIntent,
} from "./structure-command-intent";
import {
  buildCodeAuditSnapshot,
  formatCodeAuditSnapshotForPrompt,
  TECH_DEPARTMENT_CODE_AUDIT_ANSWER_PREFIX,
} from "./tech-department/code-audit-context";
import {
  buildTechDepartmentDiagnosticContext,
  TECH_DEPARTMENT_DIAGNOSTIC_ANSWER_PREFIX,
} from "./tech-department/diagnostic-context";
import {
  createDestructiveStructurePlan,
  createTechStructurePlan,
  formatStructurePlanForUser,
} from "./tech-department/structure-plan";
import type { TechStructurePlan } from "./tech-department/structure-types";
import type { ChatAttachment } from "./chat/chat-attachment-types";
import {
  buildAttachmentContextForPrompt,
  fetchChatAttachmentsByIds,
  resolveChatResponseAttachments,
} from "./chat/chat-attachments-server";

export type ChatWorkflowStep = {
  step_order: number;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  target_chamber?: { id: string; name: string; entity_type: string } | null;
  assigned_agent?: { id: string; name: string } | null;
};

export type TeamAgentAnswer = {
  agentId: string;
  slug: string;
  agentName: string;
  status: "success" | "error";
  answer?: string;
  error?: string;
  latencyMs: number;
};

export type CouncilExecutionPayload = {
  partial: boolean;
  invokedCount: number;
  successCount: number;
  report: AnalysisReport | null;
  agents: TeamAgentAnswer[];
  wallTimeMs: number;
};

export type TeamExecutionPayload = {
  partial: boolean;
  invokedCount: number;
  successCount: number;
  summary: string;
  synthesis: AnalysisReport | null;
  agents: TeamAgentAnswer[];
};

export type ExecuteChatTaskResult =
  | {
      mode: "single";
      executionMode: ExecutionMode;
      answer: string;
      routing: RouteDecision;
      targetName: string | null;
      agentName: string | null;
      agentId: string | null;
      /** Reserve free agent answered after primary failure. */
      governmentFallback?: boolean;
      fast?: TeamExecutionPayload;
      team?: TeamExecutionPayload;
      council?: CouncilExecutionPayload;
      /** Block 3: pending structure plan awaiting user confirmation. */
      structurePlan?: TechStructurePlan;
      /** Files from library returned to the user (view/download in chat). */
      attachments?: ChatAttachment[];
    }
  | {
      mode: "workflow";
      workflowId: string;
      answer: string | null;
      status: string;
      steps: ChatWorkflowStep[];
    };

const SLUG_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  groq: "Groq",
  mistral: "Mistral",
  "or-qwen": "Qwen",
  "or-llama": "Llama",
  "or-deepseek-r1": "DeepSeek R1",
  "or-gemma": "Gemma",
  "or-mistral": "Mistral Small",
};

function agentDisplayName(slug: string): string {
  return SLUG_DISPLAY_NAMES[slug] ?? slug;
}

async function resolveAgentNames(slugs: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const slug of slugs) {
    map.set(slug, agentDisplayName(slug));
  }
  return map;
}

async function resolveChamberLeadForSynthesis(
  chamberRegistryId: string,
  successResults: Array<{ agentId: string; slug: string; answer?: string }>,
  nameMap: Map<string, string>,
): Promise<{ agent: string; answer: string } | null> {
  const managerId = await resolveChamberManagerAgentId(chamberRegistryId);
  if (!managerId) return null;

  const leadResult = successResults.find((r) => r.agentId === managerId);
  if (!leadResult?.answer) return null;

  const supabase = getSupabaseAdmin();
  const { data: agentRow } = await supabase
    .from("agents")
    .select("name")
    .eq("id", managerId)
    .maybeSingle();

  return {
    agent: agentRow?.name ?? nameMap.get(leadResult.slug) ?? leadResult.slug,
    answer: leadResult.answer,
  };
}

async function archiveChamberAnswer(params: {
  entityRegistryId: string;
  taskText: string;
  answer: string;
  agentName?: string | null;
  chamberName?: string | null;
  fallbackUsed?: boolean;
}): Promise<void> {
  try {
    await writeChamberArchiveEntry(params);
  } catch (err) {
    console.warn("[executeChatTask] chamber archive write failed:", err);
  }
}

async function resolveExecutionTargetChamberRegistryId(
  targetRegistryId: string,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data: chamber } = await supabase
    .from("chambers")
    .select("entity_registry_id")
    .eq("entity_registry_id", targetRegistryId)
    .maybeSingle();
  if (chamber?.entity_registry_id) return chamber.entity_registry_id;

  const mainChamber = await resolveMainChamber(targetRegistryId);
  return mainChamber?.chamberRegistryId ?? targetRegistryId;
}

async function executeFastMode(
  taskText: string,
  decision: RouteDecision,
  options?: { forceFailSlugs?: string[]; turbo?: boolean },
): Promise<ExecuteChatTaskResult> {
  const routedTargetId = decision.targets[0]?.entityRegistryId || GENERAL_INTAKE_ID;
  const chosenTargetId = await resolveExecutionTargetChamberRegistryId(routedTargetId);

  const agents = await selectAgentsForExecutionMode(routedTargetId, "fast", options);
  console.info(
    `[executeChatTask] executionMode=fast agentCount=${agents.length} target=${chosenTargetId}`,
  );

  const parallel = await executeParallelAgents({
    targetChamberRegistryId: chosenTargetId,
    question: taskText,
    agentCount: agents.length,
    agents,
    rosterOnly: true,
    logToRequestLogs: true,
    forceFailSlugs: options?.forceFailSlugs,
    turbo: options?.turbo,
  });

  const supabase = getSupabaseAdmin();
  const { data: targetRow } = await supabase
    .from("entity_registry")
    .select("name")
    .eq("id", chosenTargetId)
    .maybeSingle();

  if (decision.routingLogId) {
    await updateRoutingLogAgentCount(decision.routingLogId, parallel.invokedCount, "fast");
    decision.agentCount = parallel.invokedCount;
  }

  const nameMap = await resolveAgentNames(parallel.results.map((r) => r.slug));
  const successResults = parallel.results.filter((r) => r.status === "success" && r.answer);
  const successCount = successResults.length;
  const partial = successCount < parallel.invokedCount;

  if (successCount === 0) {
    throw new Error("Ни один free-агент не смог ответить");
  }

  const answer =
    successCount === 1
      ? successResults[0].answer ?? ""
      : successResults.map((r) => r.answer).join("\n\n---\n\n");

  const partialBanner = partial
    ? `⚠ Частичный Fast: ${successCount} из ${parallel.invokedCount} free-агентов ответили.\n\n`
    : "";

  await archiveChamberAnswer({
    entityRegistryId: chosenTargetId,
    taskText,
    answer: `${partialBanner}${answer}`,
    agentName: `${successCount} free-агентов`,
    chamberName: targetRow?.name ?? null,
  });

  return {
    mode: "single",
    executionMode: "fast",
    answer,
    routing: decision,
    targetName: targetRow?.name ?? null,
    agentName: `${successCount} free-агентов`,
    agentId: null,
    fast: {
      partial,
      invokedCount: parallel.invokedCount,
      successCount,
      summary: answer,
      synthesis: null,
      agents: parallel.results.map((r) => ({
        agentId: r.agentId,
        slug: r.slug,
        agentName: nameMap.get(r.slug) ?? r.slug,
        status: r.status,
        answer: r.answer,
        error: r.error,
        latencyMs: r.latencyMs,
      })),
    },
  };
}

type ParallelExecutionMode = Exclude<ExecutionMode, "fast">;

async function executeParallelExecutionMode(
  taskText: string,
  decision: RouteDecision,
  mode: ParallelExecutionMode,
  options?: { forceFailSlugs?: string[]; turbo?: boolean },
): Promise<ExecuteChatTaskResult> {
  const routedTargetId = decision.targets[0]?.entityRegistryId || GENERAL_INTAKE_ID;
  const chosenTargetId = await resolveExecutionTargetChamberRegistryId(routedTargetId);

  const agents = await selectAgentsForExecutionMode(routedTargetId, mode, options);

  console.info(
    `[executeChatTask] executionMode=${mode} agentCount=${agents.length} target=${chosenTargetId}`,
  );

  const modeStart = Date.now();
  const parallel = await executeParallelAgents({
    targetChamberRegistryId: chosenTargetId,
    question: taskText,
    agentCount: agents.length,
    agents,
    rosterOnly: true,
    logToRequestLogs: true,
    forceFailSlugs: options?.forceFailSlugs,
    turbo: mode === "turbo" ? true : options?.turbo,
  });

  const invokedCount = parallel.invokedCount;
  if (decision.routingLogId) {
    await updateRoutingLogAgentCount(decision.routingLogId, invokedCount, mode);
    decision.agentCount = invokedCount;
  }

  const nameMap = await resolveAgentNames(parallel.results.map((r) => r.slug));
  const parallelAgents: TeamAgentAnswer[] = parallel.results.map((r) => ({
    agentId: r.agentId,
    slug: r.slug,
    agentName: nameMap.get(r.slug) ?? r.slug,
    status: r.status,
    answer: r.answer,
    error: r.error,
    latencyMs: r.latencyMs,
  }));

  const successResults = parallel.results.filter((r) => r.status === "success" && r.answer);
  const successCount = successResults.length;
  const partial = successCount < invokedCount;

  let synthesis: AnalysisReport | null = null;
  let summary = "";
  let report: AnalysisReport | null = null;
  let answerBody = "";

  const consensusVariant = mode === "team" ? "team" : "council";

  if (successCount >= 2) {
    try {
      const chamberLead = await resolveChamberLeadForSynthesis(
        chosenTargetId,
        successResults,
        nameMap,
      );
      const consensus = await runConsensusAnalysis(
        successResults.map((r) => ({
          agent: nameMap.get(r.slug) ?? r.slug,
          answer: r.answer!,
        })),
        consensusVariant,
        { chamberLead },
      );
      synthesis = consensus.report;
      report = consensus.report;
      const verdict = report.finalVerdict || report.consensus;
      summary = verdict;
      answerBody = verdict;
    } catch (err) {
      console.error(`[executeChatTask] ${mode} synthesis failed:`, err);
      const joined = successResults.map((r) => r.answer).join("\n\n---\n\n");
      summary = joined;
      answerBody = joined;
    }
  } else if (successCount === 1) {
    summary = successResults[0].answer ?? "";
    answerBody = summary;
  } else {
    throw new Error("Ни один эксперт не смог ответить");
  }

  const partialBanner =
    mode === "team"
      ? partial
        ? `⚠ Частичный результат: ${successCount} из ${invokedCount} экспертов ответили. Сводка по доступным данным.\n\n`
        : ""
      : partial
        ? successCount >= 2
          ? `⚠ Не все эксперты ответили: ${successCount} из ${invokedCount}. Отчёт по доступным данным.\n\n`
          : `⚠ Частичный ${mode === "turbo" ? "Turbo" : "Council"}: только 1 из ${invokedCount} экспертов ответил.\n\n`
        : "";

  const answer = mode === "team" ? summary : answerBody;

  const supabase = getSupabaseAdmin();
  const { data: targetRow } = await supabase
    .from("entity_registry")
    .select("name")
    .eq("id", chosenTargetId)
    .maybeSingle();

  await archiveChamberAnswer({
    entityRegistryId: chosenTargetId,
    taskText,
    answer: `${partialBanner}${answer}`,
    agentName: `${successCount} экспертов`,
    chamberName: targetRow?.name ?? null,
  });

  if (mode === "team") {
    return {
      mode: "single",
      executionMode: "team",
      answer,
      routing: decision,
      targetName: targetRow?.name ?? null,
      agentName: `${successCount} экспертов`,
      agentId: null,
      team: {
        partial,
        invokedCount,
        successCount,
        summary,
        synthesis,
        agents: parallelAgents,
      },
    };
  }

  return {
    mode: "single",
    executionMode: mode,
    answer,
    routing: decision,
    targetName: targetRow?.name ?? null,
    agentName: `${successCount} экспертов`,
    agentId: null,
    council: {
      partial,
      invokedCount,
      successCount,
      report,
      agents: parallelAgents,
      wallTimeMs: Date.now() - modeStart,
    },
  };
}

async function executeTeamMode(
  taskText: string,
  decision: RouteDecision,
  options?: { forceFailSlugs?: string[]; turbo?: boolean },
): Promise<ExecuteChatTaskResult> {
  return executeParallelExecutionMode(taskText, decision, "team", options);
}

async function executeCouncilMode(
  taskText: string,
  decision: RouteDecision,
  options?: { forceFailSlugs?: string[]; turbo?: boolean },
): Promise<ExecuteChatTaskResult> {
  return executeParallelExecutionMode(taskText, decision, "council", options);
}

async function executeTurboMode(
  taskText: string,
  decision: RouteDecision,
  options?: { forceFailSlugs?: string[]; turbo?: boolean },
): Promise<ExecuteChatTaskResult> {
  return executeParallelExecutionMode(taskText, decision, "turbo", options);
}

async function executeDirectAgentMode(
  taskText: string,
  agentRegistryId: string,
  chamberRegistryId: string,
): Promise<ExecuteChatTaskResult> {
  const supabase = getSupabaseAdmin();
  const officeId = await requireExternalEntryOfficeId();
  await assertAgentContextAccess({ officeId, agentId: agentRegistryId, chamberRegistryId });

  const [{ data: agentReg }, { data: agentRow }, { data: chamberRow }] = await Promise.all([
    supabase.from("entity_registry").select("slug, name").eq("id", agentRegistryId).maybeSingle(),
    supabase.from("agents").select("name, cost_tier").eq("id", agentRegistryId).maybeSingle(),
    supabase.from("entity_registry").select("name").eq("id", chamberRegistryId).maybeSingle(),
  ]);

  if (!agentReg?.slug) {
    throw new Error("Агент не найден");
  }

  const routingLogId = await logDirectAgentRoutingDecision({
    taskText,
    directAgentId: agentRegistryId,
    directTargetEntityId: chamberRegistryId,
    agentCount: 0,
  });

  const invoked = await invokeChamberAgentWithFreeFallback({
    chamberRegistryId: chamberRegistryId,
    question: taskText,
      primaryAgent: {
        agentId: agentRegistryId,
        slug: agentReg.slug,
        registryId: agentRegistryId,
        costTier: normalizeCostTier(agentRow?.cost_tier),
      },
    });

  if (routingLogId) {
    await updateRoutingLogAgentCount(routingLogId, 1, "fast");
  }

  const decision: RouteDecision = {
    targets: [
      {
        entityRegistryId: chamberRegistryId,
        confidence: 1,
        reason: "direct_agent",
      },
    ],
    method: "direct_agent",
    agentCount: 1,
    routingLogId: routingLogId ?? undefined,
  };

  await archiveChamberAnswer({
    entityRegistryId: chamberRegistryId,
    taskText,
    answer: invoked.answer,
    agentName: agentRow?.name ?? agentReg.name ?? agentReg.slug,
    chamberName: chamberRow?.name ?? null,
    fallbackUsed: invoked.governmentFallback,
  });

  return {
    mode: "single",
    executionMode: "fast",
    answer: invoked.answer,
    routing: decision,
    targetName: chamberRow?.name ?? null,
    agentName: agentRow?.name ?? agentReg.name ?? agentReg.slug,
    agentId: agentRegistryId,
    governmentFallback: invoked.governmentFallback,
  };
}

function applyDirectTarget(
  decision: RouteDecision,
  directTargetEntityId?: string,
): RouteDecision {
  if (!directTargetEntityId) return decision;
  return {
    ...decision,
    targets: [
      {
        entityRegistryId: directTargetEntityId,
        confidence: 1,
        reason: "direct_chamber",
      },
    ],
    method: "rule-based",
  };
}

async function loadSelectedAgent(agentId: string): Promise<SelectedAgent | null> {
  const supabase = getSupabaseAdmin();
  const [{ data: regRow }, { data: agentRow }] = await Promise.all([
    supabase.from("entity_registry").select("slug").eq("id", agentId).maybeSingle(),
    supabase.from("agents").select("cost_tier").eq("id", agentId).maybeSingle(),
  ]);
  if (!regRow) return null;
  return {
    agentId,
    slug: regRow.slug,
    registryId: agentId,
    costTier: normalizeCostTier(agentRow?.cost_tier),
  };
}

async function resolveManagerEntry(
  sourceEntityId?: string,
  directTargetEntityId?: string,
  targetAgentId?: string,
  _executionMode?: ExecutionMode,
): Promise<{ buildingId: string; managerChamberId: string } | null> {
  if (targetAgentId) return null;

  const candidateId = directTargetEntityId ?? sourceEntityId;
  if (!candidateId) return null;
  if (!(await isMainChamber(candidateId))) return null;

  const buildingId = await resolveBuildingRegistryIdForChamber(candidateId);
  if (!buildingId) return null;

  return { buildingId, managerChamberId: candidateId };
}

function mayorSelfAnswerFromDecision(
  decision: MayorRoutingDecision,
  mayorAnswer: string | null,
): string {
  if (
    decision.trace.includes("fallback_no_main_chamber") ||
    decision.trace.includes("fallback_invalid_or_low_confidence")
  ) {
    return MAYOR_DELEGATE_TARGET_NOT_CONFIGURED_ANSWER;
  }
  return mayorAnswer?.trim() || MAYOR_ROUTING_MISSING_ANSWER;
}

async function executeManagerTask(
  taskText: string,
  buildingRegistryId: string,
  options?: {
    turbo?: boolean;
    applySummary?: boolean;
    managerChamberRegistryId?: string;
    executionMode?: ExecutionMode;
    forceFailSlugs?: string[];
    officeId?: string;
  },
): Promise<ExecuteChatTaskResult> {
  const supabase = getSupabaseAdmin();
  const applySummary = options?.applySummary !== false;
  const executionMode = options?.executionMode ?? "fast";

  const mainChamber = await resolveMainChamber(buildingRegistryId);

  if (!mainChamber) {
    console.warn(
      `[executeManagerTask] building=${buildingRegistryId} has no main chamber (routing_role=main)`,
    );
    const { data: buildingRow } = await supabase
      .from("entity_registry")
      .select("name")
      .eq("id", buildingRegistryId)
      .maybeSingle();

    return {
      mode: "single",
      executionMode,
      answer: MAYOR_DELEGATE_TARGET_NOT_CONFIGURED_ANSWER,
      routing: {
        targets: [
          {
            entityRegistryId: buildingRegistryId,
            confidence: 0,
            reason: "building_not_configured",
          },
        ],
        method: "llm-cheap",
        agentCount: 0,
      },
      targetName: buildingRow?.name ?? null,
      agentName: null,
      agentId: null,
    };
  }

  const managerChamberRegistryId =
    options?.managerChamberRegistryId ?? mainChamber.chamberRegistryId;
  const allInternalChambers = await listBuildingInternalChambers(buildingRegistryId);
  const internalChambers = await filterInternalChambersBySendTasksConnection(
    managerChamberRegistryId,
    allInternalChambers,
  );
  const managerDecision = await resolveManagerRoutingDecision(
    taskText,
    buildingRegistryId,
    managerChamberRegistryId,
    internalChambers,
    { officeId: options?.officeId },
  );

  const executionChamberRegistryId =
    managerDecision.action === "delegate" && managerDecision.delegatedChamberId
      ? managerDecision.delegatedChamberId
      : mainChamber.chamberRegistryId;

  const syntheticDecision: RouteDecision = {
    targets: [
      {
        entityRegistryId: executionChamberRegistryId,
        confidence: managerDecision.confidence,
        reason: managerDecision.reasoning,
      },
    ],
    method: "llm-cheap",
    agentCount: 0,
  };

  if (
    executionMode === "team" ||
    executionMode === "council" ||
    executionMode === "turbo"
  ) {
    const { data: logRow } = await supabase
      .from("routing_logs")
      .insert({
        task_text: taskText,
        chosen_target_entity_registry_id: executionChamberRegistryId,
        all_candidates: internalChambers.map((c) => ({
          entityRegistryId: c.id,
          confidence: managerDecision.confidence,
          reason: c.name,
        })),
        method: "llm-cheap",
        agent_count: 0,
        outcome: "unrated",
        execution_mode: executionMode,
        routing_action: managerDecision.action,
        routing_matched_by: managerDecision.matchedBy,
        routing_confidence: managerDecision.confidence,
        routing_reasoning: managerDecision.reasoning,
        routing_trace: managerDecision.trace,
        delegated_building_id: buildingRegistryId,
        delegated_chamber_id: managerDecision.delegatedChamberId ?? mainChamber.chamberRegistryId,
      })
      .select("id")
      .single();
    syntheticDecision.routingLogId = logRow?.id;
  }

  if (executionMode === "team") {
    return executeTeamMode(taskText, syntheticDecision, {
      turbo: options?.turbo,
      forceFailSlugs: options?.forceFailSlugs,
    });
  }
  if (executionMode === "council") {
    return executeCouncilMode(taskText, syntheticDecision, {
      turbo: options?.turbo,
      forceFailSlugs: options?.forceFailSlugs,
    });
  }
  if (executionMode === "turbo") {
    return executeTurboMode(taskText, syntheticDecision, {
      turbo: options?.turbo,
      forceFailSlugs: options?.forceFailSlugs,
    });
  }

  let selectedAgent: SelectedAgent | null = null;
  if (executionChamberRegistryId === mainChamber.chamberRegistryId && mainChamber.managerAgentId) {
    const managerAgent = await loadSelectedAgent(mainChamber.managerAgentId);
    if (managerAgent && (!options?.turbo || managerAgent.costTier === "premium")) {
      selectedAgent = managerAgent;
    }
  }
  if (!selectedAgent) {
    selectedAgent = await selectAgentForChamberEntity(executionChamberRegistryId, {
      turbo: options?.turbo,
      executionMode: "fast",
    });
  }

  if (!selectedAgent) {
    throw new Error("Не найден агент для выполнения задачи");
  }

  const invoked = await invokeChamberAgentWithFreeFallback({
    chamberRegistryId: executionChamberRegistryId,
    question: taskText,
    primaryAgent: selectedAgent,
  });

  let finalAnswer = invoked.answer;
  let summaryApplied = false;
  const delegatedInternally =
    managerDecision.action === "delegate" &&
    managerDecision.delegatedChamberId != null &&
    managerDecision.delegatedChamberId !== mainChamber.chamberRegistryId;

  if (applySummary && delegatedInternally) {
    try {
      const [{ data: buildingRow }, { data: deptRow }] = await Promise.all([
        supabase.from("entity_registry").select("name").eq("id", buildingRegistryId).maybeSingle(),
        supabase
          .from("entity_registry")
          .select("name")
          .eq("id", executionChamberRegistryId)
          .maybeSingle(),
      ]);
      const summarized = await invokeCheapLLM({
        purpose: "manager-summary",
        prompt: buildManagerSummaryPrompt({
          buildingName: buildingRow?.name ?? "the building",
          departmentName: deptRow?.name ?? "internal chamber",
          taskText,
          departmentAnswer: invoked.answer,
        }),
        responseFormat: "text",
        temperature: 0.3,
        officeId: options?.officeId,
      });
      if (summarized?.trim()) {
        finalAnswer = summarized.trim();
        summaryApplied = true;
      }
    } catch (e) {
      console.warn("Manager summary LLM failed, using raw response:", e);
    }
  }

  const { data: logRow } = await supabase
    .from("routing_logs")
    .insert({
      task_text: taskText,
      chosen_target_entity_registry_id: executionChamberRegistryId,
      all_candidates: internalChambers.map((c) => ({
        entityRegistryId: c.id,
        confidence: managerDecision.confidence,
        reason: c.name,
      })),
      method: "llm-cheap",
      agent_count: invoked.agent ? 1 : 0,
      outcome: "unrated",
      execution_mode: executionMode,
      routing_action: managerDecision.action,
      routing_matched_by: managerDecision.matchedBy,
      routing_confidence: managerDecision.confidence,
      routing_reasoning: managerDecision.reasoning,
      routing_trace: managerDecision.trace,
      delegated_building_id: buildingRegistryId,
      delegated_chamber_id: managerDecision.delegatedChamberId ?? mainChamber.chamberRegistryId,
    })
    .select("id")
    .single();

  const [{ data: targetRow }, { data: agentRow }] = await Promise.all([
    supabase
      .from("entity_registry")
      .select("name")
      .eq("id", executionChamberRegistryId)
      .maybeSingle(),
    supabase.from("agents").select("name").eq("id", selectedAgent.agentId).maybeSingle(),
  ]);

  const routeDecision: RouteDecision = {
    targets: [
      {
        entityRegistryId: executionChamberRegistryId,
        confidence: managerDecision.confidence,
        reason: managerDecision.reasoning,
      },
    ],
    method: "llm-cheap",
    agentCount: 0,
    routingLogId: logRow?.id,
  };

  await archiveChamberAnswer({
    entityRegistryId: executionChamberRegistryId,
    taskText,
    answer: finalAnswer,
    agentName: agentRow?.name ?? selectedAgent.slug,
    chamberName: targetRow?.name ?? null,
    fallbackUsed: invoked.governmentFallback,
  });

  if (summaryApplied) {
    console.info(
      `[executeManagerTask] delegated=${executionChamberRegistryId} summaryApplied=true`,
    );
  }

  return {
    mode: "single",
    executionMode: "fast",
    answer: finalAnswer,
    routing: routeDecision,
    targetName: targetRow?.name ?? null,
    agentName: agentRow?.name ?? selectedAgent.slug,
    agentId: selectedAgent.agentId,
    governmentFallback: invoked.governmentFallback,
  };
}

async function executeTechDepartmentTask(
  taskText: string,
  options?: { turbo?: boolean; executionMode?: ExecutionMode; forceFailSlugs?: string[] },
): Promise<ExecuteChatTaskResult> {
  const supabase = getSupabaseAdmin();
  const executionMode = options?.executionMode ?? "fast";
  const officeId = await requireExternalEntryOfficeId();
  const techBuildingId = await requireTechDepartmentBuildingId(officeId);
  await requireTechDepartmentMainChamberRegistryId(officeId);
  const mainChamber = await resolveMainChamber(techBuildingId);

  if (!mainChamber) {
    throw new Error("Main chamber Технического отдела не найден");
  }

  const intent = classifyTechDepartmentIntent(taskText);

  if (intent === "structure") {
    const destructive = hasDestructiveStructureIntent(taskText);
    const compoundDestructiveCreate = hasCompoundDestructiveCreateStructureIntent(taskText);

    if (compoundDestructiveCreate) {
      const { data: logRow } = await supabase
        .from("routing_logs")
        .insert({
          task_text: taskText,
          chosen_target_entity_registry_id: mainChamber.chamberRegistryId,
          all_candidates: [],
          method: "tech-structure-compound-blocked",
          agent_count: 0,
          outcome: "unrated",
          execution_mode: "fast",
          routing_action: "structure_compound_blocked",
          routing_reasoning:
            "Compound destructive+create structure command blocked before planner (PLANNER-COMPOUND-1B)",
          routing_trace: ["tech_department", "structure", "compound_blocked"],
          delegated_building_id: techBuildingId,
          delegated_chamber_id: mainChamber.chamberRegistryId,
        })
        .select("id")
        .single();

      return {
        mode: "single",
        executionMode: "fast",
        answer: CHAT_COMPOUND_DESTRUCTIVE_CREATE_ANSWER,
        routing: {
          targets: [
            {
              entityRegistryId: mainChamber.chamberRegistryId,
              confidence: 1,
              reason: "structure_compound_blocked",
            },
          ],
          method: "tech-structure-compound-blocked",
          agentCount: 0,
          routingLogId: logRow?.id,
        },
        targetName: "Технический отдел",
        agentName: null,
        agentId: null,
      };
    }

    const plan = destructive
      ? await createDestructiveStructurePlan(taskText)
      : await createTechStructurePlan(taskText);
    const answer = formatStructurePlanForUser(plan);

    const { data: logRow } = await supabase
      .from("routing_logs")
      .insert({
        task_text: taskText,
        chosen_target_entity_registry_id: mainChamber.chamberRegistryId,
        all_candidates: [],
        method: "tech-structure-plan",
        agent_count: 0,
        outcome: "unrated",
        execution_mode: "fast",
        routing_action: destructive ? "structure_destructive_plan" : "structure_plan",
        routing_reasoning: destructive
          ? "Tech Department destructive plan pending confirmation (non-executable TD-03B)"
          : "Tech Department structure plan pending confirmation",
        routing_trace: destructive
          ? ["tech_department", "structure", "destructive_plan", "pending_confirmation"]
          : ["tech_department", "structure", "pending_confirmation"],
        delegated_building_id: techBuildingId,
        delegated_chamber_id: mainChamber.chamberRegistryId,
      })
      .select("id")
      .single();

    return {
      mode: "single",
      executionMode: "fast",
      answer,
      routing: {
        targets: [
          {
            entityRegistryId: mainChamber.chamberRegistryId,
            confidence: 1,
            reason: destructive ? "tech_structure_destructive_plan" : "tech_structure_plan",
          },
        ],
        method: "tech-structure-plan",
        agentCount: 0,
        routingLogId: logRow?.id,
      },
      targetName: "Технический отдел",
      agentName: null,
      agentId: null,
      structurePlan: plan,
    };
  }

  const selectedAgent = await selectAgentForChamberEntity(mainChamber.chamberRegistryId, {
    turbo: options?.turbo,
    executionMode,
  });

  if (!selectedAgent) {
    throw new Error("Не найден агент Технического отдела");
  }

  if (intent === "code_audit") {
    const snapshot = await buildCodeAuditSnapshot(taskText);
    const authError = snapshot.githubErrors.find((error) => error.kind === "auth");
    if (authError) {
      const answer = `Code Audit остановлен: ${authError.message}. Исходный код не был загружен — проверьте GITHUB_TOKEN и GITHUB_REPO.`;

      const { data: logRow } = await supabase
        .from("routing_logs")
        .insert({
          task_text: taskText,
          chosen_target_entity_registry_id: mainChamber.chamberRegistryId,
          all_candidates: [],
          method: "tech-code-audit",
          agent_count: 0,
          outcome: "unrated",
          execution_mode: executionMode,
          routing_action: "code_audit",
          routing_reasoning: "Tech Department code audit blocked — GitHub auth failure",
          routing_trace: ["tech_department", "code_audit", "github_auth_error"],
          delegated_building_id: techBuildingId,
          delegated_chamber_id: mainChamber.chamberRegistryId,
        })
        .select("id")
        .single();

      return {
        mode: "single",
        executionMode,
        answer,
        routing: {
          targets: [
            {
              entityRegistryId: mainChamber.chamberRegistryId,
              confidence: 1,
              reason: "tech_code_audit",
            },
          ],
          method: "tech-code-audit",
          agentCount: 0,
          routingLogId: logRow?.id,
        },
        targetName: "Технический отдел",
        agentName: null,
        agentId: null,
      };
    }

    const codeAuditSnapshot = formatCodeAuditSnapshotForPrompt(taskText, snapshot);
    const systemPromptPrefix = `${TECH_DEPARTMENT_CODE_AUDIT_ANSWER_PREFIX}\n\n${codeAuditSnapshot}`;

    const invoked = await invokeChamberAgentWithFreeFallback({
      chamberRegistryId: mainChamber.chamberRegistryId,
      question: taskText,
      primaryAgent: selectedAgent,
      systemPromptPrefix,
    });

    const { data: logRow } = await supabase
      .from("routing_logs")
      .insert({
        task_text: taskText,
        chosen_target_entity_registry_id: mainChamber.chamberRegistryId,
        all_candidates: [],
        method: "tech-code-audit",
        agent_count: 1,
        outcome: "unrated",
        execution_mode: executionMode,
        routing_action: "code_audit",
        routing_reasoning: "Tech Department code audit read-only (GitHub)",
        routing_trace: ["tech_department", "code_audit"],
        delegated_building_id: techBuildingId,
        delegated_chamber_id: mainChamber.chamberRegistryId,
      })
      .select("id")
      .single();

    const { data: agentRow } = await supabase
      .from("agents")
      .select("name")
      .eq("id", selectedAgent.agentId)
      .maybeSingle();

    await archiveChamberAnswer({
      entityRegistryId: mainChamber.chamberRegistryId,
      taskText,
      answer: invoked.answer,
      agentName: agentRow?.name ?? selectedAgent.slug,
      chamberName: "Технический отдел",
      fallbackUsed: invoked.governmentFallback,
    });

    return {
      mode: "single",
      executionMode,
      answer: invoked.answer,
      routing: {
        targets: [
          {
            entityRegistryId: mainChamber.chamberRegistryId,
            confidence: 1,
            reason: "tech_code_audit",
          },
        ],
        method: "tech-code-audit",
        agentCount: 1,
        routingLogId: logRow?.id,
      },
      targetName: "Технический отдел",
      agentName: agentRow?.name ?? selectedAgent.slug,
      agentId: selectedAgent.agentId,
      governmentFallback: invoked.governmentFallback,
    };
  }

  const diagnosticSnapshot = await buildTechDepartmentDiagnosticContext(taskText);
  const systemPromptPrefix = `${TECH_DEPARTMENT_DIAGNOSTIC_ANSWER_PREFIX}\n\n${diagnosticSnapshot}`;

  const invoked = await invokeChamberAgentWithFreeFallback({
    chamberRegistryId: mainChamber.chamberRegistryId,
    question: taskText,
    primaryAgent: selectedAgent,
    systemPromptPrefix,
  });

  const { data: logRow } = await supabase
    .from("routing_logs")
    .insert({
      task_text: taskText,
      chosen_target_entity_registry_id: mainChamber.chamberRegistryId,
      all_candidates: [],
      method: "llm-cheap",
      agent_count: 1,
      outcome: "unrated",
      execution_mode: executionMode,
      routing_action: "diagnose",
      routing_reasoning: "Tech Department diagnostic read-only",
      routing_trace: ["tech_department", "diagnose"],
      delegated_building_id: techBuildingId,
      delegated_chamber_id: mainChamber.chamberRegistryId,
    })
    .select("id")
    .single();

  const [{ data: agentRow }] = await Promise.all([
    supabase.from("agents").select("name").eq("id", selectedAgent.agentId).maybeSingle(),
  ]);

  await archiveChamberAnswer({
    entityRegistryId: mainChamber.chamberRegistryId,
    taskText,
    answer: invoked.answer,
    agentName: agentRow?.name ?? selectedAgent.slug,
    chamberName: "Технический отдел",
    fallbackUsed: invoked.governmentFallback,
  });

  return {
    mode: "single",
    executionMode,
    answer: invoked.answer,
    routing: {
      targets: [
        {
          entityRegistryId: mainChamber.chamberRegistryId,
          confidence: 1,
          reason: "tech_diagnose",
        },
      ],
      method: "llm-cheap",
      agentCount: 1,
      routingLogId: logRow?.id,
    },
    targetName: "Технический отдел",
    agentName: agentRow?.name ?? selectedAgent.slug,
    agentId: selectedAgent.agentId,
    governmentFallback: invoked.governmentFallback,
  };
}

async function persistMayorConversationIfNeeded(
  conversationId: string | undefined,
  userText: string,
  assistantText: string,
  assistantKind: MayorConversationMessageKind = "answer",
): Promise<void> {
  if (!conversationId) return;
  await appendMayorConversationTurn(conversationId, userText, assistantText, assistantKind);
}

async function wrapMayorResultWithConversationMemory(
  conversationId: string | undefined,
  userText: string,
  result: ExecuteChatTaskResult,
): Promise<ExecuteChatTaskResult> {
  if (conversationId && result.mode === "single" && result.answer?.trim()) {
    await persistMayorConversationIfNeeded(
      conversationId,
      userText,
      result.answer.trim(),
      "answer",
    );
  }
  return result;
}

async function buildMayorClarificationResult(params: {
  reason: string;
  mayorAgentId: string;
  mayorChamberRegistryId: string;
  mayorExecutionMode: ExecutionMode;
}): Promise<ExecuteChatTaskResult> {
  const supabase = getSupabaseAdmin();
  const [{ data: agentRow }, { data: chamberRow }] = await Promise.all([
    supabase.from("agents").select("name").eq("id", params.mayorAgentId).maybeSingle(),
    supabase.from("entity_registry").select("name").eq("id", params.mayorChamberRegistryId).maybeSingle(),
  ]);

  return {
    mode: "single",
    executionMode: params.mayorExecutionMode,
    answer: params.reason,
    routing: {
      targets: [
        {
          entityRegistryId: params.mayorChamberRegistryId,
          confidence: 1,
          reason: "structure_anaphora_clarify",
        },
      ],
      method: "llm-cheap",
      agentCount: 0,
    },
    targetName: chamberRow?.name ?? null,
    agentName: agentRow?.name ?? null,
    agentId: params.mayorAgentId,
  };
}

/** Mayor path LLM usage: conversation + execution mode for llm_usage_logs attribution. */
async function executeMayorTaskWithUsageContext(
  taskText: string,
  mayorAgentId: string,
  mayorChamberRegistryId: string,
  options?: {
    turbo?: boolean;
    executionMode?: ExecutionMode;
    forceFailSlugs?: string[];
    forceMayorInvokeError?: boolean;
    conversationId?: string;
    officeId?: string;
  },
): Promise<ExecuteChatTaskResult> {
  return runWithLlmUsageContext(
    {
      conversationId: options?.conversationId ?? null,
      executionMode: options?.executionMode ?? "fast",
    },
    () => executeMayorTask(taskText, mayorAgentId, mayorChamberRegistryId, options),
  );
}

async function executeMayorTask(
  taskText: string,
  mayorAgentId: string,
  mayorChamberRegistryId: string,
  options?: {
    turbo?: boolean;
    executionMode?: ExecutionMode;
    forceFailSlugs?: string[];
    forceMayorInvokeError?: boolean;
    /** Channel-scoped id, e.g. telegram:<chat_id>. Enables memory + clarify. */
    conversationId?: string;
    officeId?: string;
  },
): Promise<ExecuteChatTaskResult> {
  const supabase = getSupabaseAdmin();
  const mayorExecutionMode = options?.executionMode ?? "fast";
  const officeId = options?.officeId ?? (await requireExternalEntryOfficeId());

  const { data: buildings } = await supabase
    .from("entity_registry")
    .select("id, name, routing_description")
    .eq("entity_type", "building");

  const buildingRows = buildings || [];
  const validBuildingIds = new Set(buildingRows.map((b) => b.id));

  const conversationHistory = options?.conversationId
    ? await loadMayorConversationHistory(options.conversationId)
    : [];
  const clarifyAllowed =
    Boolean(options?.conversationId) && mayorClarifyAllowed(conversationHistory);
  const modelHistory = trimMayorConversationTurnsForPrompt(
    mayorConversationTurnsForModel(conversationHistory),
  );

  const anaphoraResult = await resolveStructureCommandAnaphora(taskText, modelHistory, { officeId });

  if (anaphoraResult.outcome === "ambiguous") {
    await persistMayorConversationIfNeeded(
      options?.conversationId,
      taskText,
      anaphoraResult.reason,
      "clarify",
    );
    return buildMayorClarificationResult({
      reason: anaphoraResult.reason,
      mayorAgentId,
      mayorChamberRegistryId,
      mayorExecutionMode,
    });
  }

  const resolvedTaskText =
    anaphoraResult.outcome === "expanded" ? anaphoraResult.expandedText : taskText;

  const officeInventory = await computeOfficeInventoryCounts(officeId);
  const officeSnapshot = formatMayorOfficeSnapshotPrompt(officeInventory);
  const sharedMemoryRecord = await loadMayorSharedMemory(officeId);
  const sharedMemoryReadView = compactMayorSharedMemoryReadView(sharedMemoryRecord.summary);

  let decision: MayorRoutingDecision | null = null;
  let mayorAnswer: string | null = null;

  if (isOfficeInventoryCountQuestion(resolvedTaskText)) {
    decision = {
      action: "answer_self",
      matchedBy: "semantic",
      confidence: 1,
      reasoning: OFFICE_INVENTORY_SNAPSHOT_REASONING,
      trace: [...OFFICE_INVENTORY_SNAPSHOT_TRACE],
    };
    mayorAnswer = formatMayorInventoryAnswer(resolvedTaskText, officeInventory);
  } else if (isStructureMutationCommand(resolvedTaskText)) {
    decision = await resolveStructureMutationMayorRoutingDecision(resolvedTaskText);
  } else if (isSystemReadOnlyQuestion(resolvedTaskText)) {
    decision = await resolveSystemReadOnlyMayorRoutingDecision(resolvedTaskText);
  } else {
    decision = await resolveDeterministicMayorRoutingDecision(resolvedTaskText, buildingRows);
  }

  let governmentFallback = false;
  let mayorAgentName: string | null = null;
  let mayorAgentSlug: string | null = null;

  if (!decision) {
    const [{ data: agentReg }, { data: agentRow }] = await Promise.all([
      supabase.from("entity_registry").select("slug, name").eq("id", mayorAgentId).maybeSingle(),
      supabase.from("agents").select("name").eq("id", mayorAgentId).maybeSingle(),
    ]);

    if (!agentReg?.slug) {
      throw new Error("Агент Мэра не найден — проверьте назначение агента в главной палате City Hall.");
    }

    mayorAgentName = agentRow?.name ?? agentReg.name ?? agentReg.slug;
    mayorAgentSlug = agentReg.slug;

    try {
      const mayorPromptOptions = { clarifyAllowed, officeSnapshot, sharedMemoryReadView };
      const mayorPromptParts = buildMayorExecutiveSystemPromptParts(
        buildingRows,
        mayorPromptOptions,
      );
      const invoked = await invokeChamberAgentWithFreeFallback({
        chamberRegistryId: mayorChamberRegistryId,
        question: resolvedTaskText,
        primaryAgent: {
          agentId: mayorAgentId,
          slug: agentReg.slug,
          registryId: mayorAgentId,
          costTier: "mid",
        },
        systemPromptPrefix: buildMayorExecutiveSystemPrompt(buildingRows, mayorPromptOptions),
        mayorPromptParts,
        forceError: options?.forceMayorInvokeError,
        maxTokens: 4096,
        conversationHistory: modelHistory,
        usagePurpose: "mayor_answer",
      });

      governmentFallback = invoked.governmentFallback;
      const parsed = parseMayorAgentRoutingEnvelope(invoked.answer, buildingRows);
      let parsedDecision = parsed.decision;
      if (parsedDecision.action === "clarify") {
        if (!clarifyAllowed) {
          parsedDecision = {
            ...parsedDecision,
            action: "answer_self",
            trace: [...parsedDecision.trace, "clarify_blocked"],
          };
        } else if (!parsed.answer?.trim()) {
          parsedDecision = {
            ...parsedDecision,
            action: "answer_self",
            trace: [...parsedDecision.trace, "clarify_empty"],
          };
        }
      }
      decision = await finalizeMayorRoutingDecision(parsedDecision, validBuildingIds);
      mayorAnswer = parsed.answer;
    } catch (err) {
      const internalMessage = err instanceof Error ? err.message : String(err);
      console.warn("[executeMayorTask] Mayor invoke failed:", internalMessage);

      const { data: chamberRow } = await supabase
        .from("entity_registry")
        .select("name")
        .eq("id", mayorChamberRegistryId)
        .maybeSingle();

      return {
        mode: "single",
        executionMode: options?.executionMode ?? "fast",
        answer: toUserFacingProviderError(err),
        routing: {
          targets: [
            {
              entityRegistryId: mayorChamberRegistryId,
              confidence: 0,
              reason: "mayor_invoke_unavailable",
            },
          ],
          method: "llm-cheap",
          agentCount: 0,
        },
        targetName: chamberRow?.name ?? null,
        agentName: mayorAgentName,
        agentId: mayorAgentId,
      };
    }
  }

  if (decision.matchedBy === "structure_command" || decision.matchedBy === "system_readonly_detector") {
    await supabase.from("routing_logs").insert({
      task_text: resolvedTaskText,
      chosen_target_entity_registry_id: decision.delegatedChamberId ?? decision.target ?? null,
      all_candidates: [],
      method: "rule-based",
      agent_count: 0,
      outcome: "unrated",
      execution_mode: mayorExecutionMode,
      routing_action: mayorRoutingLogAction(decision),
      routing_matched_by: decision.matchedBy,
      routing_confidence: decision.confidence,
      routing_reasoning: decision.reasoning,
      routing_trace: decision.trace,
      delegated_building_id: decision.delegatedBuildingId ?? null,
      delegated_chamber_id: decision.delegatedChamberId ?? null,
    });
  }

  if (decision.action === "delegate" && decision.target) {
    const techBuildingId = await requireTechDepartmentBuildingId(officeId);
    if (decision.target === techBuildingId) {
      return wrapMayorResultWithConversationMemory(
        options?.conversationId,
        taskText,
        await executeTechDepartmentTask(resolvedTaskText, {
          turbo: options?.turbo,
          executionMode: options?.executionMode,
          forceFailSlugs: options?.forceFailSlugs,
        }),
      );
    }
    const delegatedBuildingId = decision.delegatedBuildingId ?? decision.target;
    const { data: delegateLogRow } = await supabase
      .from("routing_logs")
      .insert({
        task_text: resolvedTaskText,
        chosen_target_entity_registry_id: decision.delegatedChamberId ?? decision.target,
        all_candidates: [],
        method: "llm-cheap",
        agent_count: 0,
        outcome: "unrated",
        execution_mode: mayorExecutionMode,
        routing_action: mayorRoutingLogAction(decision),
        routing_matched_by: decision.matchedBy,
        routing_confidence: decision.confidence,
        routing_reasoning: decision.reasoning,
        routing_trace: decision.trace,
        delegated_building_id: delegatedBuildingId,
        delegated_chamber_id: decision.delegatedChamberId ?? null,
      })
      .select("id")
      .single();

    const managerResult = await executeManagerTask(resolvedTaskText, decision.target, {
      turbo: options?.turbo,
      applySummary: true,
      executionMode: options?.executionMode,
      forceFailSlugs: options?.forceFailSlugs,
      officeId: options?.officeId,
    });

    if (managerResult.mode === "single") {
      const invokedCount =
        managerResult.council?.invokedCount ??
        managerResult.team?.invokedCount ??
        managerResult.fast?.invokedCount ??
        (managerResult.agentId ? 1 : 0);
      if (delegateLogRow?.id && invokedCount > 0) {
        await updateRoutingLogAgentCount(delegateLogRow.id, invokedCount, mayorExecutionMode);
      }
      if (delegateLogRow?.id) {
        managerResult.routing = {
          ...managerResult.routing,
          routingLogId: delegateLogRow.id,
          agentCount: invokedCount,
        };
      }
    }

    return wrapMayorResultWithConversationMemory(
      options?.conversationId,
      taskText,
      managerResult,
    );
  }

  if (decision.action === "clarify") {
    const clarifyQuestion = mayorAnswer?.trim();
    if (!clarifyQuestion) {
      decision = {
        ...decision,
        action: "answer_self",
        trace: [...decision.trace, "clarify_empty_fallback"],
      };
    } else {
      const [{ data: agentReg }, { data: agentRow }, { data: chamberRow }] = await Promise.all([
        supabase.from("entity_registry").select("slug, name").eq("id", mayorAgentId).maybeSingle(),
        supabase.from("agents").select("name").eq("id", mayorAgentId).maybeSingle(),
        supabase.from("entity_registry").select("name").eq("id", mayorChamberRegistryId).maybeSingle(),
      ]);

      await supabase.from("routing_logs").insert({
        task_text: resolvedTaskText,
        chosen_target_entity_registry_id: mayorChamberRegistryId,
        all_candidates: [],
        method: "llm-cheap",
        agent_count: mayorAgentSlug ? 1 : 0,
        outcome: "unrated",
        execution_mode: mayorExecutionMode,
        routing_action: mayorRoutingLogAction(decision),
        routing_matched_by: decision.matchedBy,
        routing_confidence: decision.confidence,
        routing_reasoning: decision.reasoning,
        routing_trace: decision.trace,
      });

      await persistMayorConversationIfNeeded(
        options?.conversationId,
        taskText,
        clarifyQuestion,
        "clarify",
      );

      return {
        mode: "single",
        executionMode: options?.executionMode ?? "fast",
        answer: clarifyQuestion,
        routing: {
          targets: [
            {
              entityRegistryId: mayorChamberRegistryId,
              confidence: decision.confidence || 1,
              reason: decision.reasoning || "clarify",
            },
          ],
          method: "llm-cheap",
          agentCount: mayorAgentSlug ? 1 : 0,
        },
        targetName: chamberRow?.name ?? null,
        agentName: mayorAgentName ?? agentRow?.name ?? agentReg?.name ?? agentReg?.slug ?? null,
        agentId: mayorAgentId,
        governmentFallback,
      };
    }
  }

  const [{ data: agentReg }, { data: agentRow }, { data: chamberRow }] = await Promise.all([
    supabase.from("entity_registry").select("slug, name").eq("id", mayorAgentId).maybeSingle(),
    supabase.from("agents").select("name").eq("id", mayorAgentId).maybeSingle(),
    supabase.from("entity_registry").select("name").eq("id", mayorChamberRegistryId).maybeSingle(),
  ]);

  if (!agentReg?.slug && !mayorAgentSlug) {
    throw new Error("Агент Мэра не найден — проверьте назначение агента в главной палате City Hall.");
  }

  const answer =
    mayorSelfAnswerFromDecision(decision, mayorAnswer);

  const { data: logRow } = await supabase
    .from("routing_logs")
    .insert({
      task_text: resolvedTaskText,
      chosen_target_entity_registry_id: mayorChamberRegistryId,
      all_candidates: [],
      method: "llm-cheap",
      agent_count: mayorAgentSlug ? 1 : 0,
      outcome: "unrated",
      execution_mode: mayorExecutionMode,
      routing_action: mayorRoutingLogAction(decision),
      routing_matched_by: decision.matchedBy,
      routing_confidence: decision.confidence,
      routing_reasoning: decision.reasoning,
      routing_trace: decision.trace,
    })
    .select("id")
    .single();

  if (logRow?.id) {
    await logMayorRoutingDecision(
      logRow.id,
      decision,
      mayorAgentId,
      null,
      false,
    );
  }

  const routeDecision: RouteDecision = {
    targets: [
      {
        entityRegistryId: mayorChamberRegistryId,
        confidence: decision.confidence || 1,
        reason: decision.reasoning || "answer_self",
      },
    ],
    method: "llm-cheap",
    agentCount: mayorAgentSlug ? 1 : 0,
    routingLogId: logRow?.id,
  };

  await archiveChamberAnswer({
    entityRegistryId: mayorChamberRegistryId,
    taskText: resolvedTaskText,
    answer,
    agentName: mayorAgentName ?? agentRow?.name ?? agentReg?.name ?? agentReg?.slug ?? null,
    chamberName: chamberRow?.name ?? null,
    fallbackUsed: governmentFallback,
  });

  await persistMayorConversationIfNeeded(options?.conversationId, taskText, answer, "answer");

  scheduleMayorSharedMemoryUpdate({
    officeId,
    userMessage: taskText,
    mayorAnswer: answer,
  });

  return {
    mode: "single",
    executionMode: options?.executionMode ?? "fast",
    answer,
    routing: routeDecision,
    targetName: chamberRow?.name ?? null,
    agentName: mayorAgentName ?? agentRow?.name ?? agentReg?.name ?? agentReg?.slug ?? null,
    agentId: mayorAgentId,
    governmentFallback,
  };
}

async function enrichChatTaskText(
  taskText: string,
  attachmentIds?: string[],
): Promise<string> {
  if (!attachmentIds?.length) return taskText;
  const attachments = await fetchChatAttachmentsByIds(attachmentIds);
  const suffix = buildAttachmentContextForPrompt(attachments);
  return suffix ? `${taskText.trim()}\n\n${suffix}` : taskText;
}

async function appendResponseAttachments(
  result: ExecuteChatTaskResult,
  originalTaskText: string,
  attachmentIds?: string[],
): Promise<ExecuteChatTaskResult> {
  if (result.mode !== "single") return result;
  const routedTargetId = result.routing.targets[0]?.entityRegistryId || GENERAL_INTAKE_ID;
  const executionRegistryId = await resolveExecutionTargetChamberRegistryId(routedTargetId);
  const attachments = await resolveChatResponseAttachments({
    taskText: originalTaskText,
    executionRegistryId,
    uploadedAttachmentIds: attachmentIds,
  });
  if (attachments.length === 0) return result;
  return { ...result, attachments };
}

export async function executeChatTask(
  taskText: string,
  sourceEntityId?: string,
  executionMode?: ExecutionMode,
  options?: {
    forceFailSlugs?: string[];
    targetAgentId?: string;
    directTargetEntityId?: string;
    turbo?: boolean;
    attachmentIds?: string[];
    /** Non-production verify only — simulates Mayor invoke failure. */
    forceMayorInvokeError?: boolean;
    /** Channel-scoped id for Mayor memory (e.g. telegram:12345). */
    conversationId?: string;
  },
): Promise<ExecuteChatTaskResult> {
  if (executionMode !== undefined && !isExecutionMode(executionMode)) {
    throw new Error(`Unsupported executionMode: ${String(executionMode)}`);
  }

  const officeId = await requireExternalEntryOfficeId();
  const resolvedExecutionMode =
    executionMode ?? (await resolveOfficeExecutionMode(officeId));
  const originalTaskText = taskText.trim();
  const workingTaskText = await enrichChatTaskText(originalTaskText, options?.attachmentIds);
  const finish = async (result: ExecuteChatTaskResult) => {
    const withAttachments = await appendResponseAttachments(
      result,
      originalTaskText,
      options?.attachmentIds,
    );
    if (withAttachments.mode === "single" && withAttachments.answer) {
      return {
        ...withAttachments,
        answer: sanitizeUserFacingText(withAttachments.answer),
      };
    }
    return withAttachments;
  };

  if (options?.targetAgentId) {
    const chamberId =
      options.directTargetEntityId ?? sourceEntityId ?? GENERAL_INTAKE_ID;
    const officeId = await requireExternalEntryOfficeId();
    const mayorResult = await isMayorAgentByGraph(options.targetAgentId, officeId);
    const isMayor = mayorResult?.value === true;
    if (isMayor) {
      return finish(
        await executeMayorTaskWithUsageContext(workingTaskText, options.targetAgentId, chamberId, {
          turbo: options?.turbo,
          executionMode: resolvedExecutionMode,
          forceFailSlugs: options?.forceFailSlugs,
          forceMayorInvokeError:
            process.env.NODE_ENV !== "production" ? options?.forceMayorInvokeError : undefined,
          conversationId: options?.conversationId,
          officeId,
        }),
      );
    }
    return finish(await executeDirectAgentMode(workingTaskText, options.targetAgentId, chamberId));
  }

  // RTP-1A: default user intent → Mayor unless explicit direct target or another building Manager.
  if (!options?.targetAgentId && !options?.directTargetEntityId) {
    const mayor = await resolveCityHallMainAgent(officeId);
    if (mayor) {
      const explicitManagerEntry =
        sourceEntityId &&
        sourceEntityId !== mayor.chamberRegistryId &&
        (await resolveManagerEntry(
          sourceEntityId,
          undefined,
          undefined,
          resolvedExecutionMode,
        ));
      if (!explicitManagerEntry) {
        return finish(
          await executeMayorTaskWithUsageContext(workingTaskText, mayor.agentId, mayor.chamberRegistryId, {
            turbo: options?.turbo,
            executionMode: resolvedExecutionMode,
            forceFailSlugs: options?.forceFailSlugs,
            forceMayorInvokeError:
              process.env.NODE_ENV !== "production" ? options?.forceMayorInvokeError : undefined,
            conversationId: options?.conversationId,
            officeId,
          }),
        );
      }
    }
  }

  const managerEntry = await resolveManagerEntry(
    sourceEntityId,
    options?.directTargetEntityId,
    options?.targetAgentId,
    resolvedExecutionMode,
  );
  if (managerEntry) {
    const officeId = await requireExternalEntryOfficeId();
    if (sourceEntityId) {
      const techMainChamberId = await requireTechDepartmentMainChamberRegistryId(officeId);
      if (sourceEntityId === techMainChamberId) {
        return finish(
          await executeTechDepartmentTask(workingTaskText, {
            turbo: options?.turbo,
            executionMode: resolvedExecutionMode,
            forceFailSlugs: options?.forceFailSlugs,
          }),
        );
      }
    }
    return finish(
      await executeManagerTask(workingTaskText, managerEntry.buildingId, {
        turbo: options?.turbo,
        applySummary: true,
        managerChamberRegistryId: managerEntry.managerChamberId,
        executionMode: resolvedExecutionMode,
        forceFailSlugs: options?.forceFailSlugs,
        officeId,
      }),
    );
  }

  const result = await processTask(workingTaskText, sourceEntityId);

  if (result.mode === "workflow") {
    const supabase = getSupabaseAdmin();
    const { data: workflow } = await supabase
      .from("workflows")
      .select("id, status, final_output, task_text")
      .eq("id", result.workflowId)
      .single();

    const { data: steps } = await supabase
      .from("workflow_steps")
      .select(
        "step_order, status, input_summary, output_summary, target_chamber:entity_registry!target_chamber_entity_id(id, name, entity_type), assigned_agent:agents(id, name)",
      )
      .eq("workflow_id", result.workflowId)
      .order("step_order", { ascending: true });

    const normalizedSteps: ChatWorkflowStep[] = (steps ?? []).map((row) => {
      const tc = row.target_chamber;
      const aa = row.assigned_agent;
      return {
        step_order: row.step_order,
        status: row.status,
        input_summary: row.input_summary,
        output_summary: row.output_summary,
        target_chamber: Array.isArray(tc) ? tc[0] ?? null : tc ?? null,
        assigned_agent: Array.isArray(aa) ? aa[0] ?? null : aa ?? null,
      };
    });

    return {
      mode: "workflow",
      workflowId: result.workflowId,
      answer: workflow?.final_output ?? null,
      status: workflow?.status ?? "unknown",
      steps: normalizedSteps,
    };
  }

  if (resolvedExecutionMode === "team") {
    return finish(
      await executeTeamMode(
        workingTaskText,
        applyDirectTarget(result.decision, options?.directTargetEntityId),
        options,
      ),
    );
  }

  if (resolvedExecutionMode === "council") {
    return finish(
      await executeCouncilMode(
        workingTaskText,
        applyDirectTarget(result.decision, options?.directTargetEntityId),
        options,
      ),
    );
  }

  if (resolvedExecutionMode === "turbo") {
    return finish(
      await executeTurboMode(
        workingTaskText,
        applyDirectTarget(result.decision, options?.directTargetEntityId),
        options,
      ),
    );
  }

  return finish(
    await executeFastMode(
      workingTaskText,
      applyDirectTarget(result.decision, options?.directTargetEntityId),
      options,
    ),
  );
}
