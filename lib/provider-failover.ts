export type ProviderAttemptResult = {
  ok: boolean;
  status: number;
  answer?: string;
  error?: string;
  /** Provider usage payload as returned by the API (usage or usageMetadata). */
  rawUsage?: unknown;
};

export type UsageLogMeta = {
  purpose: string;
  isFallback?: boolean;
};

export type CallWithModelFallbackOptions<T extends string> = {
  providerTag: string;
  primaryModel: T;
  fallbackPool: readonly T[];
  isRetryable: (status: number, message: string) => boolean;
  callOnce: (model: T) => Promise<ProviderAttemptResult>;
  onFallback?: (primary: T, used: T) => void;
  usageLog?: UsageLogMeta;
};

export function candidateModels<T extends string>(
  primaryModel: T,
  fallbackPool: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const model of [primaryModel, ...fallbackPool]) {
    if (!seen.has(model)) {
      seen.add(model);
      out.push(model);
    }
  }
  return out;
}

async function logUsage(
  params: Parameters<
    typeof import("./llm-usage-log").insertLlmUsageLog
  >[0],
): Promise<void> {
  if (typeof window !== "undefined") return;
  const { insertLlmUsageLog } = await import("./llm-usage-log");
  await insertLlmUsageLog(params);
}

/**
 * Shared provider failover: try primary model, then each fallback in order.
 * Logs `[providerTag] auto-fallback primary=… → used=…` on switch.
 */
export async function callWithModelFallback<T extends string>(
  opts: CallWithModelFallbackOptions<T>,
): Promise<{ answer: string; modelUsed: T }> {
  let lastError = `All ${opts.providerTag} models failed`;
  const models = candidateModels(opts.primaryModel, opts.fallbackPool);

  for (let attemptIndex = 0; attemptIndex < models.length; attemptIndex++) {
    const model = models[attemptIndex]!;
    const result = await opts.callOnce(model);

    if (result.ok && result.answer) {
      if (opts.usageLog?.purpose) {
        await logUsage({
          provider: opts.providerTag,
          modelId: model,
          purpose: opts.usageLog.purpose,
          rawUsage: result.rawUsage ?? null,
          isRetry: attemptIndex > 0,
          isFallback: opts.usageLog.isFallback ?? false,
          attemptIndex,
        });
      }
      if (model !== opts.primaryModel) {
        console.info(
          `[${opts.providerTag}] auto-fallback primary=${opts.primaryModel} → used=${model}`,
        );
        opts.onFallback?.(opts.primaryModel, model);
      }
      return { answer: result.answer, modelUsed: model };
    }

    if (result.rawUsage != null) {
      await logUsage({
        provider: opts.providerTag,
        modelId: model,
        purpose: opts.usageLog?.purpose ?? "unknown",
        rawUsage: result.rawUsage,
        error: result.error ?? lastError,
        isRetry: attemptIndex > 0,
        isFallback: opts.usageLog?.isFallback ?? false,
        attemptIndex,
      });
    }

    lastError = result.error ?? lastError;
    if (!opts.isRetryable(result.status, lastError)) {
      throw new Error(lastError);
    }
    console.warn(
      `[${opts.providerTag}] model=${model} failed (${result.status}): ${lastError}`,
    );
  }

  throw new Error(lastError);
}
