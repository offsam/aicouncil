import type { CostTier } from "@/lib/cost-tier";
import { isCostTier } from "@/lib/cost-tier";
import { parseDebateTierFromMode } from "@/lib/workspace/resolve-city-hall-council-chamber";

export const MAX_DEBATE_REVISIONS = 3;

export type DebateClosedReason = "confirmed" | "attempts_exhausted" | "error";

export type DebateSuccessClosedReason = Extract<
  DebateClosedReason,
  "confirmed" | "attempts_exhausted"
>;

/** Isolated tier debate: agents from one City Hall chamber (free / $ / $$ / $$$). */
export type DebateTierMode = { tier: CostTier };

export type DebateRoundAction =
  | "initial"
  | "confirm"
  | "critical_revision"
  | "accept"
  | "counter_revision";

export type DebateAgentInfo = {
  agentId: string;
  slug: string;
  name: string;
  costTier: CostTier;
};

export type DebateRoundSummary = {
  roundIndex: number;
  agentId: string;
  agentName: string;
  action: DebateRoundAction;
  content: string;
  optionalNotes?: string;
  criticalIssues?: string;
  latencyMs?: number;
};

export type AgentDebateResult = {
  debateId: string;
  answer: string;
  closedReason: DebateSuccessClosedReason;
  author: DebateAgentInfo;
  reviewer: DebateAgentInfo;
  councilChamberName: string;
  debateTier: CostTier;
  rounds: DebateRoundSummary[];
};

export type ParsedDebateTurn = {
  verdict: "confirm" | "revise";
  optionalNotes?: string;
  criticalIssues?: string;
  answer?: string;
};

export function debateTierMode(tier: CostTier): DebateTierMode {
  return { tier };
}

export function isDebateTierMode(value: unknown): value is DebateTierMode {
  return parseDebateTierFromMode(value) !== null;
}

export function normalizeDebateTierMode(value: DebateTierMode | unknown): CostTier | null {
  return parseDebateTierFromMode(value);
}

/** @deprecated Use debateTierMode */
export function isolatedDebateTierMode(tier: CostTier): DebateTierMode {
  return { tier };
}
