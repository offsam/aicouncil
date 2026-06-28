import { resolveProductionOfficeId } from "@/lib/workspace/resolve-production-office";
import { resolveCityHallMainAgent } from "@/lib/workspace/city-hall-orchestrator";

export type MayorChatTarget = {
  officeId: string;
  targetAgentId: string;
  directTargetEntityId: string;
  agentName: string;
  chamberName: string;
};

/** Mayor agent + City Hall main chamber for Telegram / external chat bridges. */
export async function resolveMayorChatTarget(): Promise<MayorChatTarget | null> {
  const officeId = await resolveProductionOfficeId();
  if (!officeId) return null;

  const mayor = await resolveCityHallMainAgent(officeId);
  if (!mayor) return null;

  return {
    officeId,
    targetAgentId: mayor.agentId,
    directTargetEntityId: mayor.chamberRegistryId,
    agentName: mayor.agentName,
    chamberName: mayor.chamberName,
  };
}
