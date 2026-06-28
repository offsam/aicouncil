import {
  selectAgentForChamberEntity,
  selectFreeAgentForChamberEntity,
  type SelectedAgent,
} from "./agent-selection";
import { invokeAgentForWorkflow } from "./invoke-agent";

export type ChamberInvokeResult = {
  answer: string;
  agent: SelectedAgent;
  /** True when primary failed and a free-tier reserve agent answered. */
  governmentFallback: boolean;
  primaryError?: string;
};

export async function invokeChamberAgentWithFreeFallback(params: {
  chamberRegistryId: string;
  question: string;
  forceError?: boolean;
  /** When set, skip agent selection and use this agent as primary. */
  primaryAgent?: SelectedAgent;
  systemPromptPrefix?: string | null;
  maxTokens?: number;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<ChamberInvokeResult> {
  const primary =
    params.primaryAgent ??
    (await selectAgentForChamberEntity(params.chamberRegistryId));
  if (!primary) {
    throw new Error("Нет доступного агента для выбранного маршрута");
  }

  try {
    const answer = await invokeAgentForWorkflow({
      agentSlug: primary.slug,
      agentRegistryId: primary.registryId,
      chamberRegistryId: params.chamberRegistryId,
      question: params.question,
      forceError: params.forceError,
      systemPromptPrefix: params.systemPromptPrefix,
      maxTokens: params.maxTokens,
      conversationHistory: params.conversationHistory,
    });
    return { answer, agent: primary, governmentFallback: false };
  } catch (primaryErr) {
    const primaryError =
      primaryErr instanceof Error ? primaryErr.message : "Invoke failed";
    const reserve = await selectFreeAgentForChamberEntity(
      params.chamberRegistryId,
      primary.agentId,
    );
    if (!reserve) {
      throw primaryErr;
    }
    try {
      const answer = await invokeAgentForWorkflow({
        agentSlug: reserve.slug,
        agentRegistryId: reserve.registryId,
        chamberRegistryId: params.chamberRegistryId,
        question: params.question,
        systemPromptPrefix: params.systemPromptPrefix,
        maxTokens: params.maxTokens,
        conversationHistory: params.conversationHistory,
      });
      console.info(
        `[chamber-fallback] chamber=${params.chamberRegistryId} primary=${primary.slug} failed → reserve=${reserve.slug} (free)`,
      );
      return {
        answer,
        agent: reserve,
        governmentFallback: true,
        primaryError,
      };
    } catch (reserveErr) {
      throw reserveErr;
    }
  }
}
