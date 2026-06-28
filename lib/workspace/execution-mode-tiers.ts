import type { CostTier } from "@/lib/cost-tier";
import { COST_TIER_ORDER, normalizeCostTier } from "@/lib/cost-tier";
import type { ExecutionMode } from "@/lib/execution-mode";
import { isExecutionMode } from "@/lib/execution-mode";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WorkspaceMeta } from "./constants";

/** Highest cost tier eligible to respond when a given execution mode is active. */
export const EXECUTION_MODE_MAX_ACTIVE_TIER: Record<ExecutionMode, CostTier> = {
  fast: "free",
  team: "cheap",
  council: "mid",
};

export function parseExecutionModeFromWorkspaceMeta(raw: unknown): ExecutionMode {
  if (!raw || typeof raw !== "object") return "fast";
  const mode = (raw as WorkspaceMeta).execution_mode;
  return isExecutionMode(mode) ? mode : "fast";
}

export function isCostTierActiveForExecutionMode(
  tier: CostTier | string | null | undefined,
  mode: ExecutionMode,
): boolean {
  const normalized = normalizeCostTier(tier);
  const maxTier = EXECUTION_MODE_MAX_ACTIVE_TIER[mode];
  return COST_TIER_ORDER[normalized] <= COST_TIER_ORDER[maxTier];
}

/** Canvas tier glow: Smart highlights premium ($$$); otherwise execution mode caps. */
export function isAgentTierHighlightedForWorkspace(
  tier: CostTier | string | null | undefined,
  mode: ExecutionMode,
  smartEnabled = false,
): boolean {
  if (smartEnabled) {
    return normalizeCostTier(tier) === "premium";
  }
  return isCostTierActiveForExecutionMode(tier, mode);
}

/** City-wide execution mode from offices.workspace_meta (defaults to cheapest-only). */
export async function resolveOfficeExecutionMode(officeId: string): Promise<ExecutionMode> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("offices")
    .select("workspace_meta")
    .eq("id", officeId)
    .maybeSingle();
  return parseExecutionModeFromWorkspaceMeta(data?.workspace_meta);
}
