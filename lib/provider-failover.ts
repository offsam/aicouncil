export type ProviderAttemptResult = {
  ok: boolean;
  status: number;
  answer?: string;
  error?: string;
};

export type CallWithModelFallbackOptions<T extends string> = {
  providerTag: string;
  primaryModel: T;
  fallbackPool: readonly T[];
  isRetryable: (status: number, message: string) => boolean;
  callOnce: (model: T) => Promise<ProviderAttemptResult>;
  onFallback?: (primary: T, used: T) => void;
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

/**
 * Shared provider failover: try primary model, then each fallback in order.
 * Logs `[providerTag] auto-fallback primary=… → used=…` on switch.
 */
export async function callWithModelFallback<T extends string>(
  opts: CallWithModelFallbackOptions<T>,
): Promise<{ answer: string; modelUsed: T }> {
  let lastError = `All ${opts.providerTag} models failed`;

  for (const model of candidateModels(opts.primaryModel, opts.fallbackPool)) {
    const result = await opts.callOnce(model);
    if (result.ok && result.answer) {
      if (model !== opts.primaryModel) {
        console.info(
          `[${opts.providerTag}] auto-fallback primary=${opts.primaryModel} → used=${model}`,
        );
        opts.onFallback?.(opts.primaryModel, model);
      }
      return { answer: result.answer, modelUsed: model };
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
