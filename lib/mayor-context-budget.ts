export type MayorContextBudgetBreakdown = {
  /** Mayor role + Reality Status Policy + routing rules. */
  stablePrefixChars: number;
  /** Full system-side input (stable prefix + snapshot + buildings + chamber prefix + agent context). */
  systemPromptChars: number;
  officeSnapshotChars: number;
  buildingsListChars: number;
  chamberAnswerPrefixChars: number;
  agentContextChars: number;
  conversationHistoryChars: number;
  userMessageChars: number;
  totalInputChars: number;
  estimatedInputTokens: number;
};

function charCount(text: string | null | undefined): number {
  return text?.length ?? 0;
}

function historyChars(history: Array<{ role: string; content: string }>): number {
  return history.reduce((sum, turn) => sum + charCount(turn.content) + turn.role.length + 2, 0);
}

/** ~4 chars per token heuristic for budget observability (not billing). */
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 4);
}

export function computeMayorContextBudget(params: {
  stablePrefix: string;
  officeSnapshot: string | null;
  buildingsBlock: string;
  chamberAnswerPrefix: string;
  agentContext: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
}): MayorContextBudgetBreakdown {
  const stablePrefixChars = charCount(params.stablePrefix);
  const officeSnapshotChars = charCount(params.officeSnapshot);
  const buildingsListChars = charCount(params.buildingsBlock);
  const chamberAnswerPrefixChars = charCount(params.chamberAnswerPrefix);
  const agentContextChars = charCount(params.agentContext);
  const conversationHistoryChars = historyChars(params.conversationHistory);
  const userMessageChars = charCount(params.userMessage);

  const systemPromptChars =
    stablePrefixChars +
    officeSnapshotChars +
    buildingsListChars +
    chamberAnswerPrefixChars +
    agentContextChars;

  const totalInputChars =
    systemPromptChars + conversationHistoryChars + userMessageChars;

  return {
    stablePrefixChars,
    systemPromptChars,
    officeSnapshotChars,
    buildingsListChars,
    chamberAnswerPrefixChars,
    agentContextChars,
    conversationHistoryChars,
    userMessageChars,
    totalInputChars,
    estimatedInputTokens: estimateTokensFromChars(totalInputChars),
  };
}

export function logMayorContextBudget(budget: MayorContextBudgetBreakdown): void {
  console.info("[mayor-context-budget]", JSON.stringify(budget));
}

export function logAnthropicCacheUsage(
  purpose: string,
  rawUsage: unknown,
): void {
  if (rawUsage == null || typeof rawUsage !== "object") return;
  const u = rawUsage as Record<string, unknown>;
  const created = u.cache_creation_input_tokens;
  const read = u.cache_read_input_tokens;
  if (created == null && read == null) return;
  console.info(
    "[anthropic-cache-usage]",
    JSON.stringify({
      purpose,
      cache_creation_input_tokens: created ?? 0,
      cache_read_input_tokens: read ?? 0,
    }),
  );
}
