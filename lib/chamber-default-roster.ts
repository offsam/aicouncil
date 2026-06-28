import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogOriginToAgentIcon } from "@/lib/agent-icon-ids";
import { type CostTier, normalizeCostTier } from "@/lib/cost-tier";
import { ensureAgentRegistry } from "@/lib/entity-registry-ensure";
import {
  agentCategoryFromSpecialization,
  getModelCatalog,
} from "@/lib/model-catalog/build-catalog";
import { defaultAgentLocalPosition } from "@/lib/workspace/agent-layout";

/** One agent per tier — required for Fast / Team / Council / Turbo modes. */
export const DEFAULT_CHAMBER_ROSTER_TIERS: CostTier[] = ["free", "cheap", "mid", "premium"];

export type SeededChamberAgent = {
  tier: CostTier;
  agentId: string;
  agentName: string;
  assignmentId: string;
  source: "pool" | "catalog";
};

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

async function listAgentsByTier(
  supabase: SupabaseClient,
): Promise<Map<CostTier, Array<{ id: string; name: string; office_id: string | null }>>> {
  const { data, error } = await supabase.from("agents").select("id, name, office_id, cost_tier");
  if (error) throw new Error(error.message);

  const byTier = new Map<CostTier, Array<{ id: string; name: string; office_id: string | null }>>();
  for (const tier of DEFAULT_CHAMBER_ROSTER_TIERS) {
    byTier.set(tier, []);
  }

  for (const row of data ?? []) {
    const tier = normalizeCostTier(row.cost_tier);
    const bucket = byTier.get(tier) ?? [];
    bucket.push({ id: row.id, name: row.name, office_id: row.office_id });
    byTier.set(tier, bucket);
  }

  return byTier;
}

async function findOrCreateCatalogAgent(
  supabase: SupabaseClient,
  tier: CostTier,
): Promise<{ id: string; name: string; office_id: string | null } | null> {
  const catalog = await getModelCatalog();
  const models = catalog.filter((model) => model.costTier === tier);
  const picked = pickRandom(models);
  if (!picked) return null;

  const { data: existing } = await supabase
    .from("agents")
    .select("id, name, office_id")
    .eq("provider", picked.gateway)
    .eq("model_id", picked.modelId)
    .maybeSingle();

  if (existing) return existing;

  const agentName = `${picked.originProvider} ${picked.displayName}`.slice(0, 120);
  const { data: created, error } = await supabase
    .from("agents")
    .insert({
      name: agentName,
      provider: picked.gateway,
      model_id: picked.modelId,
      status: "offline",
      cost_tier: tier,
      category: agentCategoryFromSpecialization(picked.primarySpecialization),
      color: catalogOriginToAgentIcon(picked.originProviderSlug),
    })
    .select("id, name, office_id")
    .single();

  if (error || !created) {
    console.warn(`[chamber-default-roster] catalog create failed for ${tier}:`, error?.message);
    return null;
  }

  return created;
}

async function resolveAgentForTier(
  supabase: SupabaseClient,
  tier: CostTier,
  pool: Map<CostTier, Array<{ id: string; name: string; office_id: string | null }>>,
): Promise<{ agent: { id: string; name: string; office_id: string | null }; source: "pool" | "catalog" } | null> {
  const fromPool = pickRandom(pool.get(tier) ?? []);
  if (fromPool) return { agent: fromPool, source: "pool" };

  const fromCatalog = await findOrCreateCatalogAgent(supabase, tier);
  if (fromCatalog) return { agent: fromCatalog, source: "catalog" };

  return null;
}

/**
 * Assigns one random agent per cost tier when a chamber is created.
 * Reuses agents from the global pool; creates from catalog only if a tier is empty.
 */
export async function seedDefaultChamberRoster(
  supabase: SupabaseClient,
  params: { chamberId: string; chamberRegistryId: string },
): Promise<SeededChamberAgent[]> {
  const pool = await listAgentsByTier(supabase);
  const seeded: SeededChamberAgent[] = [];

  for (let index = 0; index < DEFAULT_CHAMBER_ROSTER_TIERS.length; index += 1) {
    const tier = DEFAULT_CHAMBER_ROSTER_TIERS[index];
    const resolved = await resolveAgentForTier(supabase, tier, pool);
    if (!resolved) {
      console.warn(`[chamber-default-roster] no agent for tier ${tier}, chamber ${params.chamberId}`);
      continue;
    }

    const { agent, source } = resolved;

    const { data: duplicate } = await supabase
      .from("agent_assignments")
      .select("id")
      .eq("chamber_id", params.chamberId)
      .eq("agent_id", agent.id)
      .maybeSingle();

    if (duplicate) continue;

    await ensureAgentRegistry(supabase, agent, params.chamberRegistryId);

    const layout = defaultAgentLocalPosition(index);
    const { data: assignment, error } = await supabase
      .from("agent_assignments")
      .insert({
        agent_id: agent.id,
        chamber_id: params.chamberId,
        role: tier,
        layout_x: layout.x,
        layout_y: layout.y,
      })
      .select("id")
      .single();

    if (error || !assignment) {
      console.warn(`[chamber-default-roster] assignment failed for ${tier}:`, error?.message);
      continue;
    }

    seeded.push({
      tier,
      agentId: agent.id,
      agentName: agent.name,
      assignmentId: assignment.id,
      source,
    });
  }

  return seeded;
}
