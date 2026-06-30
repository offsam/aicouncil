import { getSupabaseAdmin } from "./supabase/admin";
import { COST_TIER_ORDER, normalizeCostTier, type CostTier } from "./cost-tier";
import { resolveMainChamber } from "./workspace/resolve-main-chamber";

const EXECUTION_MODE_ALLOWED_TIERS: Record<"fast" | "team" | "council", CostTier[]> = {
  fast: ["free"],
  team: ["free", "cheap"],
  council: ["free", "cheap", "mid"],
};

const EXECUTION_MODE_REQUIRED_TIER: Record<"fast" | "team" | "council", CostTier> = {
  fast: "free",
  team: "cheap",
  council: "mid",
};

const SLUG_WORKFLOW_PREFERENCE: Record<string, number> = {
  groq: 1,
  deepseek: 2,
  "or-llama": 3,
  "or-qwen": 4,
  "or-gemma": 5,
  "or-deepseek-r1": 6,
  "or-mistral": 7,
  mistral: 8,
  gemini: 20,
  claude: 30,
  gpt: 31,
};

export type SelectedAgent = {
  agentId: string;
  slug: string;
  registryId: string;
  costTier: CostTier;
};

/**
 * Pick agents for a chamber target (Executor responsibility, not Planner).
 * Uses only agent_assignments from the resolved chamber.
 */
async function resolveRosterChamberEntity(
  targetChamberEntityId: string,
): Promise<{ chamberId: string; chamberRegistryId: string } | null> {
  const supabase = getSupabaseAdmin();

  const { data: chamber } = await supabase
    .from("chambers")
    .select("id, entity_registry_id")
    .eq("entity_registry_id", targetChamberEntityId)
    .maybeSingle();

  if (chamber?.id && chamber.entity_registry_id) {
    return {
      chamberId: chamber.id,
      chamberRegistryId: chamber.entity_registry_id,
    };
  }

  const mainChamber = await resolveMainChamber(targetChamberEntityId);
  if (mainChamber) {
    return {
      chamberId: mainChamber.chamberId,
      chamberRegistryId: mainChamber.chamberRegistryId,
    };
  }

  return null;
}

async function listAgentCandidatesForChamberEntity(
  targetChamberEntityId: string,
  options?: { rosterOnly?: boolean; turbo?: boolean },
): Promise<SelectedAgent[]> {
  const supabase = getSupabaseAdmin();
  const chamber = await resolveRosterChamberEntity(targetChamberEntityId);
  if (!chamber) return [];

  const { data: assignments } = await supabase
    .from("agent_assignments")
    .select("agent_id")
    .eq("chamber_id", chamber.chamberId);

  const agentRegistryIds = [...new Set((assignments ?? []).map((a) => a.agent_id).filter(Boolean))];
  if (agentRegistryIds.length === 0) return [];

  const { data: agentRows } = await supabase
    .from("agents")
    .select("id, cost_tier")
    .in("id", agentRegistryIds);

  const tierMap = new Map(
    (agentRows ?? []).map((r) => [r.id, normalizeCostTier(r.cost_tier)]),
  );

  const { data: registryRows } = await supabase
    .from("entity_registry")
    .select("id, slug")
    .in("id", agentRegistryIds);

  const mapped = (registryRows ?? [])
    .map((r) => ({
      registryId: r.id,
      slug: r.slug,
      agentId: r.id,
      costTier: tierMap.get(r.id) || "cheap",
      priority: COST_TIER_ORDER[tierMap.get(r.id) || "cheap"] || 2,
      slugRank: SLUG_WORKFLOW_PREFERENCE[r.slug] ?? 10,
    }));

  return mapped
    .sort((a, b) => a.priority - b.priority || a.slugRank - b.slugRank)
    .map(({ registryId, slug, agentId, costTier }) => ({
      agentId,
      slug,
      registryId,
      costTier,
    }));
}

export async function selectAgentForChamberEntity(
  targetChamberEntityId: string,
  options?: { turbo?: boolean; executionMode?: "fast" | "team" | "council" },
): Promise<SelectedAgent | null> {
  if (options?.executionMode) {
    return selectPrimaryAgentForExecutionMode(
      targetChamberEntityId,
      options.executionMode,
      { turbo: options.turbo },
    );
  }
  const candidates = await listAgentCandidatesForChamberEntity(targetChamberEntityId, options);
  return candidates[0] ?? null;
}

/** Single agent at the tier required by Fast / Team / Council (+ Turbo → premium). */
export async function selectPrimaryAgentForExecutionMode(
  targetChamberEntityId: string,
  mode: "fast" | "team" | "council",
  options?: { turbo?: boolean },
): Promise<SelectedAgent | null> {
  const agents = await selectAgentsForExecutionMode(targetChamberEntityId, mode, options);
  if (agents.length === 0) return null;

  const requiredTier = options?.turbo ? "premium" : EXECUTION_MODE_REQUIRED_TIER[mode];
  const atRequired = agents.filter((a) => a.costTier === requiredTier);
  return atRequired[0] ?? agents[0] ?? null;
}

/** Free-tier reserve agent in chamber roster (rosterOnly), excluding one agent id. */
export async function selectFreeAgentForChamberEntity(
  targetChamberEntityId: string,
  excludeAgentId?: string,
): Promise<SelectedAgent | null> {
  const candidates = await listAgentCandidatesForChamberEntity(targetChamberEntityId, {
    rosterOnly: true,
  });
  const free = candidates.filter(
    (c) => c.costTier === "free" && c.agentId !== excludeAgentId,
  );
  return free[0] ?? null;
}

export async function chamberHasFreeAgent(targetChamberEntityId: string): Promise<boolean> {
  const agent = await selectFreeAgentForChamberEntity(targetChamberEntityId);
  return agent != null;
}

export async function selectAgentsForChamberEntity(
  targetChamberEntityId: string,
  agentCount: number,
  options?: { rosterOnly?: boolean; turbo?: boolean },
): Promise<SelectedAgent[]> {
  const candidates = await listAgentCandidatesForChamberEntity(
    targetChamberEntityId,
    options,
  );
  void agentCount;
  return candidates;
}

export async function selectAgentsForExecutionMode(
  targetChamberEntityId: string,
  mode: "fast" | "team" | "council",
  options?: { turbo?: boolean },
): Promise<SelectedAgent[]> {
  const candidates = await listAgentCandidatesForChamberEntity(targetChamberEntityId, {
    rosterOnly: true,
  });
  const allowed = options?.turbo
    ? (["free", "cheap", "mid", "premium"] as CostTier[])
    : EXECUTION_MODE_ALLOWED_TIERS[mode];
  const selected = candidates.filter((c) => allowed.includes(c.costTier));
  const requiredTier = options?.turbo
    ? "premium"
    : EXECUTION_MODE_REQUIRED_TIER[mode];
  if (!selected.some((c) => c.costTier === requiredTier)) {
    if (options?.turbo) {
      throw new Error("В этом отделе не настроены premium-агенты, используйте другой режим");
    }
    if (mode === "fast") {
      throw new Error("В этом отделе не настроены бесплатные агенты, используйте другой режим");
    }
    if (mode === "team") {
      throw new Error("В этом отделе не настроены cheap-агенты, используйте другой режим");
    }
    throw new Error("В этом отделе не настроены mid-агенты, используйте другой режим");
  }
  return selected;
}

export type ChamberRosterTierCounts = Record<CostTier, number>;

/** Tier breakdown for a chamber roster — used for Team/Council UI gates. */
export async function resolveChamberRosterTierCounts(
  targetChamberEntityId: string,
): Promise<ChamberRosterTierCounts> {
  const candidates = await listAgentCandidatesForChamberEntity(targetChamberEntityId, {
    rosterOnly: true,
  });
  const tierCounts: ChamberRosterTierCounts = { free: 0, cheap: 0, mid: 0, premium: 0 };
  for (const agent of candidates) {
    tierCounts[agent.costTier] += 1;
  }
  return tierCounts;
}

/** Chamber roster size without city-level fallback (Team/Council guard). */
export async function countChamberRosterAgents(
  targetChamberEntityId: string,
  options?: { turbo?: boolean },
): Promise<number> {
  const candidates = await listAgentCandidatesForChamberEntity(targetChamberEntityId, {
    rosterOnly: true,
  });
  void options;
  return candidates.length;
}
