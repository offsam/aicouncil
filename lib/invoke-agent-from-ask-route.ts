import type { AskRequestBody } from "./api-types";
import { CHAMBER_ANSWER_SYSTEM_PREFIX } from "./agent-persona";
import { callConfiguredAgentProvider } from "./agent-provider-call";
import { loadAgentRuntimeConfig } from "./agent-runtime-config";
import { buildContext } from "./entity-registry";
import { resolveAgentRegistryIdFromAskRoute } from "./resolve-agent-from-ask-route";
import { assertAgentContextAccess } from "./security/agent-context-access";
import { requireExternalEntryOfficeId } from "./workspace/graph-identity-required";

type AskRouteBody = AskRequestBody & {
  model?: string;
  chamberRegistryId?: string;
  chamberId?: string;
};

/**
 * Legacy /api/ask-* routes — same configured-provider path as invokeAgentForWorkflow.
 * Uses agents.provider + agents.model_id from DB; no slug heuristics or fallback pools.
 */
export async function invokeAgentFromAskRoute(
  routePath: string,
  body: AskRouteBody,
): Promise<{ answer: string; agentRegistryId: string; provider: string; modelId: string }> {
  if (body.imageBase64?.trim()) {
    throw new Error(
      "Vision/image ask routes must use /api/chat with attachments — configured provider invoke is text-only here.",
    );
  }

  const agentRegistryId = await resolveAgentRegistryIdFromAskRoute(routePath, body);
  if (!agentRegistryId) {
    throw new Error("Agent not found for this ask route — check entity_registry slug mapping.");
  }

  const config = await loadAgentRuntimeConfig(agentRegistryId);
  const chamberRegistryId = body.chamberRegistryId ?? body.chamberId;
  const officeId = await requireExternalEntryOfficeId();
  await assertAgentContextAccess({
    officeId,
    agentId: agentRegistryId,
    chamberRegistryId,
  });

  const context = await buildContext(agentRegistryId, {
    chamberRegistryId,
    taskText: body.question?.trim() || undefined,
  });

  const systemPrompt = `${CHAMBER_ANSWER_SYSTEM_PREFIX}\n\n${context.flattenedPrompt}`.trim();
  const question = body.question?.trim() || "";

  console.info(
    `[invoke-agent] agent=${config.agentId} provider=${config.provider} model=${config.modelId}`,
  );

  const answer = await callConfiguredAgentProvider({
    config,
    systemPrompt,
    question,
  });

  return {
    answer,
    agentRegistryId,
    provider: config.provider,
    modelId: config.modelId,
  };
}
