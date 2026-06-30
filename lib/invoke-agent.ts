import { buildContext } from "./entity-registry";
import { CHAMBER_ANSWER_SYSTEM_PREFIX } from "./agent-persona";
import {
  anthropicSystemBlocksToString,
  buildMayorAnthropicCachedSystemBlocks,
} from "./anthropic-prompt-cache";
import { callConfiguredAgentProvider } from "./agent-provider-call";
import { loadAgentRuntimeConfig } from "./agent-runtime-config";
import type { MayorExecutiveSystemPromptParts } from "./mayor-persona";
import {
  computeMayorContextBudget,
  logMayorContextBudget,
} from "./mayor-context-budget";
import {
  invokeMayorWithGitHubTools,
  type MayorGitHubToolMode,
} from "./mayor-github-invoke";
import { ProviderInvokeError } from "./provider-user-error";

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + "...";
}

export type InvokeAgentParams = {
  agentSlug: string;
  agentRegistryId: string;
  chamberRegistryId: string;
  question: string;
  previousStepOutput?: string | null;
  forceError?: boolean;
  /** Prepended before buildContext flattenedPrompt (e.g. role overlay). */
  systemPromptPrefix?: string | null;
  /** Mayor-only structured prompt parts for Anthropic cache breakpoints (MAYOR-COST-1A). */
  mayorPromptParts?: MayorExecutiveSystemPromptParts | null;
  /** Override max output tokens (e.g. Mayor JSON envelope). */
  maxTokens?: number;
  /** Prior user/assistant turns in the same conversation (Mayor memory). */
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  /** llm_usage_logs.purpose */
  usagePurpose?: string;
  usageIsFallback?: boolean;
  /** Mayor GitHub tool loop — only for code_audit / coding_task (GITHUB-CONNECTOR-V1). */
  mayorGitHubToolMode?: MayorGitHubToolMode | null;
};

/**
 * Invoke agent for a workflow step (server-side).
 * Uses the agent's configured provider/model from the agents table — not slug heuristics.
 */
export async function invokeAgentForWorkflow(params: InvokeAgentParams): Promise<string> {
  if (params.forceError) {
    throw new ProviderInvokeError("test", "test", "Forced workflow step failure (test)");
  }

  const runtimeConfig = await loadAgentRuntimeConfig(params.agentRegistryId);

  const context = await buildContext(params.agentRegistryId, {
    chamberRegistryId: params.chamberRegistryId,
    taskText: params.question,
  });

  let systemPrompt = context.flattenedPrompt;
  const prefixParts: string[] = [CHAMBER_ANSWER_SYSTEM_PREFIX];
  if (params.systemPromptPrefix?.trim()) {
    prefixParts.unshift(params.systemPromptPrefix.trim());
  }
  systemPrompt = `${prefixParts.join("\n\n")}\n\n${systemPrompt}`.trim();
  if (params.previousStepOutput?.trim()) {
    systemPrompt += `\n\n[Previous workflow step output]\n${truncate(params.previousStepOutput, 2000)}`;
  }

  let anthropicSystemBlocks: ReturnType<typeof buildMayorAnthropicCachedSystemBlocks> | undefined;
  if (params.mayorPromptParts && runtimeConfig.provider === "anthropic") {
    anthropicSystemBlocks = buildMayorAnthropicCachedSystemBlocks(
      params.mayorPromptParts,
      context.flattenedPrompt,
    );
    const cachedString = anthropicSystemBlocksToString(anthropicSystemBlocks);
    if (cachedString.trim() !== systemPrompt.trim()) {
      console.warn(
        "[invoke-agent] Mayor Anthropic cache blocks diverge from string system prompt — using string fallback",
      );
      anthropicSystemBlocks = undefined;
    } else {
      logMayorContextBudget(
        computeMayorContextBudget({
          stablePrefix: params.mayorPromptParts.stablePrefix,
          officeSnapshot: params.mayorPromptParts.officeSnapshot,
          buildingsBlock: params.mayorPromptParts.buildingsBlock,
          chamberAnswerPrefix: CHAMBER_ANSWER_SYSTEM_PREFIX,
          agentContext: context.flattenedPrompt,
          conversationHistory: params.conversationHistory ?? [],
          userMessage: params.question,
        }),
      );
    }
  }

  console.info(
    `[invoke-agent] agent=${runtimeConfig.agentId} provider=${runtimeConfig.provider} model=${runtimeConfig.modelId}`,
  );

  if (params.mayorGitHubToolMode && runtimeConfig.provider === "anthropic") {
    return invokeMayorWithGitHubTools({
      modelId: runtimeConfig.modelId,
      systemPrompt,
      question: params.question,
      maxTokens: params.maxTokens,
      conversationHistory: params.conversationHistory,
      usagePurpose: params.usagePurpose ?? "mayor_answer",
      usageIsFallback: params.usageIsFallback,
      anthropicSystemBlocks,
      toolMode: params.mayorGitHubToolMode,
    });
  }

  return callConfiguredAgentProvider({
    config: runtimeConfig,
    systemPrompt,
    question: params.question,
    maxTokens: params.maxTokens,
    conversationHistory: params.conversationHistory,
    usagePurpose: params.usagePurpose ?? "agent_invoke",
    usageIsFallback: params.usageIsFallback,
    anthropicSystemBlocks,
  });
}

export function summarizeOutput(full: string, max = 200): string {
  return truncate(full, max);
}
