import type { ExecutionMode } from "@/lib/execution-mode";
import { isExecutionMode } from "@/lib/execution-mode";
import {
  EXECUTION_MODE_MAX_ACTIVE_TIER,
  isCostTierAllowedForExecutionMode,
} from "@/lib/execution-mode-tier-policy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WorkspaceMeta } from "./constants";

export {
  EXECUTION_MODE_MAX_ACTIVE_TIER,
  isCostTierActiveForExecutionMode,
  isCostTierAllowedForExecutionMode,
} from "@/lib/execution-mode-tier-policy";

export function parseExecutionModeFromWorkspaceMeta(raw: unknown): ExecutionMode {
  if (!raw || typeof raw !== "object") return "fast";
  const mode = (raw as WorkspaceMeta).execution_mode;
  return isExecutionMode(mode) ? mode : "fast";
}

/** Canvas tier glow — uses the same allowed-tier policy as backend selection. */
export function isAgentTierHighlightedForWorkspace(
  tier: Parameters<typeof isCostTierAllowedForExecutionMode>[0],
  mode: ExecutionMode,
  /** @deprecated Legacy Smart checkbox — mirrors executionMode === "turbo" when true. */
  smartEnabled = false,
): boolean {
  const effectiveMode: ExecutionMode = smartEnabled ? "turbo" : mode;
  return isCostTierAllowedForExecutionMode(tier, effectiveMode);
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
