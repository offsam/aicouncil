import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { DebateClosedReason, DebateRoundAction, DebateTierMode } from "./types";

export type DebateSessionRow = {
  id: string;
  question: string;
  status: "active" | "closed";
  closed_reason: DebateClosedReason | null;
  caller_entity_id: string;
  caller_kind: "mayor" | "chamber_manager";
  debate_chamber_id: string;
  agent_a_id: string;
  agent_b_id: string;
  initiator_agent_id: string;
  current_turn_agent_id: string | null;
  current_answer: string;
  tier_mode: DebateTierMode;
  revisions_used_a: number;
  revisions_used_b: number;
  final_answer: string | null;
};

export async function createDebateSession(params: {
  question: string;
  callerEntityId: string;
  callerKind: "mayor" | "chamber_manager";
  debateChamberId: string;
  authorAgentId: string;
  reviewerAgentId: string;
  tierMode: DebateTierMode;
}): Promise<DebateSessionRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_debates")
    .insert({
      question: params.question,
      caller_entity_id: params.callerEntityId,
      caller_kind: params.callerKind,
      debate_chamber_id: params.debateChamberId,
      agent_a_id: params.authorAgentId,
      agent_b_id: params.reviewerAgentId,
      initiator_agent_id: params.authorAgentId,
      current_turn_agent_id: params.reviewerAgentId,
      tier_mode: params.tierMode,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Не удалось создать сессию спора");
  }
  return data as DebateSessionRow;
}

export async function insertDebateRound(params: {
  debateId: string;
  roundIndex: number;
  agentId: string;
  action: DebateRoundAction;
  content: string;
  optionalNotes?: string;
  criticalIssues?: string;
  acceptedPrevious?: boolean;
  latencyMs?: number;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("agent_debate_rounds").insert({
    debate_id: params.debateId,
    round_index: params.roundIndex,
    agent_id: params.agentId,
    action: params.action,
    content: params.content,
    optional_notes: params.optionalNotes ?? null,
    critical_issues: params.criticalIssues ?? null,
    accepted_previous: params.acceptedPrevious ?? null,
    latency_ms: params.latencyMs ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function updateDebateSession(
  debateId: string,
  patch: Partial<{
    current_answer: string;
    current_turn_agent_id: string | null;
    revisions_used_a: number;
    revisions_used_b: number;
    status: "active" | "closed";
    closed_reason: DebateClosedReason;
    final_answer: string;
    closed_at: string;
  }>,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("agent_debates").update(patch).eq("id", debateId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function loadDebateRounds(debateId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_debate_rounds")
    .select("*")
    .eq("debate_id", debateId)
    .order("round_index", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}
