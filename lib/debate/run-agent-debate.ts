import type { SelectedAgent } from "@/lib/agent-selection";
import { invokeAgentForWorkflow } from "@/lib/invoke-agent";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCityHallDebateChamber } from "@/lib/workspace/resolve-city-hall-council-chamber";
import { normalizeDebateTierMode } from "./types";
import { parseDebateTurn } from "./parse-debate-turn";
import {
  createDebateSession,
  insertDebateRound,
  loadDebateRounds,
  updateDebateSession,
} from "./persist-debate";
import { buildInitialAuthorPrompt, buildReviewPrompt, mapReviewAction } from "./prompts";
import { selectDebatePair } from "./select-debate-pair";
import {
  MAX_DEBATE_REVISIONS,
  type AgentDebateResult,
  type DebateAgentInfo,
  type DebateRoundSummary,
  type DebateTierMode,
} from "./types";

const SLUG_DISPLAY: Record<string, string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  groq: "Groq",
  mistral: "Mistral",
};

function displayName(slug: string, registryName?: string | null): string {
  return registryName ?? SLUG_DISPLAY[slug] ?? slug;
}

async function loadAgentInfo(agent: SelectedAgent): Promise<DebateAgentInfo> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("entity_registry")
    .select("name")
    .eq("id", agent.agentId)
    .maybeSingle();
  return {
    agentId: agent.agentId,
    slug: agent.slug,
    name: displayName(agent.slug, data?.name),
    costTier: agent.costTier,
  };
}

async function invokeDebateAgent(params: {
  agent: SelectedAgent;
  chamberRegistryId: string;
  question: string;
}): Promise<{ answer: string; latencyMs: number }> {
  const started = Date.now();
  const answer = await invokeAgentForWorkflow({
    agentSlug: params.agent.slug,
    agentRegistryId: params.agent.agentId,
    chamberRegistryId: params.chamberRegistryId,
    question: params.question,
  });
  return { answer, latencyMs: Date.now() - started };
}

function revisionsForAgent(
  agentId: string,
  authorId: string,
  reviewerId: string,
  usedA: number,
  usedB: number,
): number {
  if (agentId === authorId) return usedA;
  if (agentId === reviewerId) return usedB;
  return MAX_DEBATE_REVISIONS;
}

export async function runAgentDebate(params: {
  question: string;
  callerEntityId: string;
  callerKind: "mayor" | "chamber_manager";
  tierMode: DebateTierMode;
  /** Diagnostic scripts only: simulate revise rounds without LLM to reach attempts_exhausted. */
  deterministicAlwaysRevise?: boolean;
}): Promise<AgentDebateResult> {
  const tier = normalizeDebateTierMode(params.tierMode);
  if (!tier) {
    throw new Error("tierMode обязателен — выберите уровень (free/cheap/mid/premium)");
  }

  const debateChamber = await resolveCityHallDebateChamber(tier);
  if (!debateChamber) {
    throw new Error(
      `Debate chamber для tier «${tier}» не найден в City Hall (ожидается отдел «${tier === "free" ? "free" : tier === "cheap" ? "$" : tier === "mid" ? "$$" : "$$$"}»)`,
    );
  }
  if (debateChamber.agentCount < 2) {
    throw new Error(`В отделе «${debateChamber.name}» меньше 2 агентов tier «${tier}»`);
  }

  const { author, reviewer } = await selectDebatePair(debateChamber.chamberRegistryId, tier);
  const authorInfo = await loadAgentInfo(author);
  const reviewerInfo = await loadAgentInfo(reviewer);

  const session = await createDebateSession({
    question: params.question,
    callerEntityId: params.callerEntityId,
    callerKind: params.callerKind,
    debateChamberId: debateChamber.chamberId,
    authorAgentId: author.agentId,
    reviewerAgentId: reviewer.agentId,
    tierMode: params.tierMode,
  });

  let roundIndex = 0;
  let currentAnswer = "";
  let revisionsA = 0;
  let revisionsB = 0;
  const criticalIssues: string[] = [];

  const invokeTurn = async (agent: SelectedAgent, question: string) => {
    if (params.deterministicAlwaysRevise) {
      if (question.includes("начальный ответ")) {
        return { answer: "Deterministic initial debate answer.", latencyMs: 1 };
      }
      return {
        answer: JSON.stringify({
          verdict: "revise",
          criticalIssues: "deterministic test revision",
          answer: `${currentAnswer} [rev-${roundIndex}]`,
        }),
        latencyMs: 1,
      };
    }
    return invokeDebateAgent({
      agent,
      chamberRegistryId: debateChamber.chamberRegistryId,
      question,
    });
  };

  const initialPrompt = buildInitialAuthorPrompt(params.question);
  const initial = params.deterministicAlwaysRevise
    ? await invokeTurn(author, initialPrompt)
    : await invokeDebateAgent({
        agent: author,
        chamberRegistryId: debateChamber.chamberRegistryId,
        question: initialPrompt,
      });
  currentAnswer = initial.answer.trim();
  await insertDebateRound({
    debateId: session.id,
    roundIndex: roundIndex++,
    agentId: author.agentId,
    action: "initial",
    content: currentAnswer,
    latencyMs: initial.latencyMs,
  });
  await updateDebateSession(session.id, { current_answer: currentAnswer });

  let turnAgent: SelectedAgent = reviewer;
  let turnRole: "reviewer" | "author" = "reviewer";

  const closeDebate = async (
    reason: "confirmed" | "attempts_exhausted",
    finalAnswer: string,
  ): Promise<AgentDebateResult> => {
    await updateDebateSession(session.id, {
      status: "closed",
      closed_reason: reason,
      final_answer: finalAnswer,
      current_answer: finalAnswer,
      current_turn_agent_id: null,
      closed_at: new Date().toISOString(),
    });

    const rows = await loadDebateRounds(session.id);
    const nameById = new Map([
      [author.agentId, authorInfo.name],
      [reviewer.agentId, reviewerInfo.name],
    ]);
    const rounds: DebateRoundSummary[] = rows.map((row) => ({
      roundIndex: row.round_index,
      agentId: row.agent_id,
      agentName: nameById.get(row.agent_id) ?? row.agent_id,
      action: row.action,
      content: row.content,
      optionalNotes: row.optional_notes ?? undefined,
      criticalIssues: row.critical_issues ?? undefined,
      latencyMs: row.latency_ms ?? undefined,
    }));

    return {
      debateId: session.id,
      answer: finalAnswer,
      closedReason: reason,
      author: authorInfo,
      reviewer: reviewerInfo,
      councilChamberName: debateChamber.name,
      debateTier: tier,
      rounds,
    };
  };

  while (true) {
    if (revisionsA >= MAX_DEBATE_REVISIONS && revisionsB >= MAX_DEBATE_REVISIONS) {
      return closeDebate("attempts_exhausted", currentAnswer);
    }

    const selfRevisions = revisionsForAgent(
      turnAgent.agentId,
      author.agentId,
      reviewer.agentId,
      revisionsA,
      revisionsB,
    );
    const otherRevisions = revisionsForAgent(
      turnAgent.agentId === author.agentId ? reviewer.agentId : author.agentId,
      author.agentId,
      reviewer.agentId,
      revisionsA,
      revisionsB,
    );

    const reviewPrompt = buildReviewPrompt({
      question: params.question,
      currentAnswer,
      role: turnRole,
      revisionsRemainingSelf: Math.max(0, MAX_DEBATE_REVISIONS - selfRevisions),
      revisionsRemainingOther: Math.max(0, MAX_DEBATE_REVISIONS - otherRevisions),
      priorCriticalIssues: criticalIssues,
    });

    const turn = await invokeTurn(turnAgent, reviewPrompt);
    const parsed = parseDebateTurn(turn.answer);

    if (parsed.verdict === "confirm") {
      const action = mapReviewAction(turnRole, "confirm");
      await insertDebateRound({
        debateId: session.id,
        roundIndex: roundIndex++,
        agentId: turnAgent.agentId,
        action,
        content: currentAnswer,
        optionalNotes: parsed.optionalNotes,
        acceptedPrevious: action === "accept" ? true : undefined,
        latencyMs: turn.latencyMs,
      });
      return closeDebate("confirmed", currentAnswer);
    }

    if (selfRevisions >= MAX_DEBATE_REVISIONS) {
      const action = mapReviewAction(turnRole, "confirm");
      await insertDebateRound({
        debateId: session.id,
        roundIndex: roundIndex++,
        agentId: turnAgent.agentId,
        action,
        content: currentAnswer,
        optionalNotes: "Попытки правки исчерпаны — принята текущая версия",
        latencyMs: turn.latencyMs,
      });
      if (revisionsA >= MAX_DEBATE_REVISIONS && revisionsB >= MAX_DEBATE_REVISIONS) {
        return closeDebate("attempts_exhausted", currentAnswer);
      }
      return closeDebate("confirmed", currentAnswer);
    }

    const revised = parsed.answer?.trim() ?? currentAnswer;
    if (parsed.criticalIssues) {
      criticalIssues.push(parsed.criticalIssues);
    }

    if (turnRole === "reviewer") {
      revisionsB += 1;
    } else {
      revisionsA += 1;
    }

    const action = mapReviewAction(turnRole, "revise");
    currentAnswer = revised;

    await insertDebateRound({
      debateId: session.id,
      roundIndex: roundIndex++,
      agentId: turnAgent.agentId,
      action,
      content: revised,
      criticalIssues: parsed.criticalIssues,
      latencyMs: turn.latencyMs,
    });
    await updateDebateSession(session.id, {
      current_answer: currentAnswer,
      current_turn_agent_id: turnRole === "reviewer" ? author.agentId : reviewer.agentId,
      revisions_used_a: revisionsA,
      revisions_used_b: revisionsB,
    });

    if (revisionsA >= MAX_DEBATE_REVISIONS && revisionsB >= MAX_DEBATE_REVISIONS) {
      return closeDebate("attempts_exhausted", currentAnswer);
    }

    if (turnRole === "reviewer") {
      turnAgent = author;
      turnRole = "author";
    } else {
      turnAgent = reviewer;
      turnRole = "reviewer";
    }
  }
}
