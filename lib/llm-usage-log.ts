import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import { normalizeProviderUsage } from "./tokens";
import type { LlmUsageContext } from "./llm-usage-context";

export type PersistLlmUsageParams = {
  provider: string;
  modelId: string;
  purpose: string;
  rawUsage: unknown;
  error?: string | null;
  isRetry?: boolean;
  isFallback?: boolean;
  attemptIndex?: number | null;
  conversationId?: string | null;
  routingLogId?: string | null;
  executionMode?: string | null;
};

async function resolveUsageContext(): Promise<LlmUsageContext> {
  if (typeof window !== "undefined") return {};
  const { getLlmUsageContext } = await import("./llm-usage-context");
  return getLlmUsageContext();
}

export async function insertLlmUsageLog(params: PersistLlmUsageParams): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const hasError = Boolean(params.error?.trim());
  if (hasError && (params.rawUsage == null || params.rawUsage === undefined)) {
    return null;
  }

  const ctx = await resolveUsageContext();
  const normalized = normalizeProviderUsage(params.provider, params.rawUsage);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("llm_usage_logs")
    .insert({
      provider: params.provider,
      model_id: params.modelId,
      purpose: params.purpose,
      input_tokens: normalized?.input ?? null,
      output_tokens: normalized?.output ?? null,
      total_tokens: normalized?.total ?? null,
      raw_usage:
        params.rawUsage == null || params.rawUsage === undefined
          ? null
          : (params.rawUsage as object),
      conversation_id: params.conversationId ?? ctx.conversationId ?? null,
      routing_log_id: params.routingLogId ?? ctx.routingLogId ?? null,
      execution_mode: params.executionMode ?? ctx.executionMode ?? null,
      is_retry: params.isRetry ?? false,
      is_fallback: params.isFallback ?? false,
      attempt_index: params.attemptIndex ?? null,
      error: params.error ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[llm-usage-log] insert failed:", error.message);
    return null;
  }

  return data?.id ?? null;
}

/** Fire-and-forget — never throws into caller paths. */
export function persistLlmUsage(params: PersistLlmUsageParams): void {
  if (typeof window !== "undefined") return;
  void insertLlmUsageLog(params).catch((err) => {
    console.error("[llm-usage-log] persist failed:", err);
  });
}
