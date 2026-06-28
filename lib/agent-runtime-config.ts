import { getSupabaseAdmin } from "./supabase/admin";

export type AgentRuntimeConfig = {
  agentId: string;
  slug: string;
  provider: string;
  modelId: string;
};

/** Load configured provider/model for an agent from the agents table (canvas-visible config). */
export async function loadAgentRuntimeConfig(agentRegistryId: string): Promise<AgentRuntimeConfig> {
  const supabase = getSupabaseAdmin();

  const [{ data: agentRow, error: agentError }, { data: regRow, error: regError }] =
    await Promise.all([
      supabase
        .from("agents")
        .select("id, provider, model_id")
        .eq("id", agentRegistryId)
        .maybeSingle(),
      supabase.from("entity_registry").select("slug").eq("id", agentRegistryId).maybeSingle(),
    ]);

  if (agentError) {
    throw new Error(`Agent lookup failed: ${agentError.message}`);
  }
  if (regError) {
    throw new Error(`Agent registry lookup failed: ${regError.message}`);
  }
  if (!agentRow?.provider?.trim() || !agentRow.model_id?.trim()) {
    throw new Error(
      `Agent ${agentRegistryId} has no configured provider/model — set provider and model_id on the canvas.`,
    );
  }

  return {
    agentId: agentRow.id,
    slug: regRow?.slug?.trim() || agentRow.id,
    provider: agentRow.provider.trim().toLowerCase(),
    modelId: agentRow.model_id.trim(),
  };
}
