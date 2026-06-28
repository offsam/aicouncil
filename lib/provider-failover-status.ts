export type ProviderHealthStatus = "available" | "on_fallback" | "unavailable";

export type ProviderHealthRow = {
  providerTag: string;
  primaryModel: string;
  modelUsed: string | null;
  status: ProviderHealthStatus;
  lastError: string | null;
  updatedAt: string;
};

export type FallbackSwitchCounts = {
  session: number;
  today: number;
};

const healthByProvider = new Map<string, ProviderHealthRow>();

let fallbackSwitchesSession = 0;
let fallbackSwitchesToday = 0;
let fallbackTodayKey = todayUtcKey();

function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureTodayBucket(): void {
  const key = todayUtcKey();
  if (key !== fallbackTodayKey) {
    fallbackTodayKey = key;
    fallbackSwitchesToday = 0;
  }
}

function recordFallbackSwitch(providerTag: string, primaryModel: string, modelUsed: string): void {
  ensureTodayBucket();
  fallbackSwitchesSession += 1;
  fallbackSwitchesToday += 1;
  console.info(
    `[provider-failover-status] fallback-switch ${providerTag} ${primaryModel} → ${modelUsed} session=${fallbackSwitchesSession} today=${fallbackSwitchesToday}`,
  );
}

export function getFallbackSwitchCounts(): FallbackSwitchCounts {
  ensureTodayBucket();
  return { session: fallbackSwitchesSession, today: fallbackSwitchesToday };
}

function upsert(providerTag: string, patch: Partial<ProviderHealthRow> & { providerTag: string }) {
  const prev = healthByProvider.get(providerTag);
  healthByProvider.set(providerTag, {
    providerTag,
    primaryModel: patch.primaryModel ?? prev?.primaryModel ?? providerTag,
    modelUsed: patch.modelUsed ?? prev?.modelUsed ?? null,
    status: patch.status ?? prev?.status ?? "available",
    lastError: patch.lastError ?? prev?.lastError ?? null,
    updatedAt: new Date().toISOString(),
  });
}

export function recordProviderSuccess(
  providerTag: string,
  primaryModel: string,
  modelUsed: string,
): void {
  const usedFallback = modelUsed !== primaryModel;
  if (usedFallback) {
    recordFallbackSwitch(providerTag, primaryModel, modelUsed);
  }
  upsert(providerTag, {
    providerTag,
    primaryModel,
    modelUsed,
    status: usedFallback ? "on_fallback" : "available",
    lastError: null,
  });
}

export function recordProviderFailure(providerTag: string, primaryModel: string, error: string): void {
  upsert(providerTag, {
    providerTag,
    primaryModel,
    modelUsed: null,
    status: "unavailable",
    lastError: error,
  });
  void import("./tech-department-escalation").then(({ maybeEscalateOnProviderFailure }) =>
    maybeEscalateOnProviderFailure(providerTag, primaryModel, error),
  );
}

export function listProviderHealth(): ProviderHealthRow[] {
  return [...healthByProvider.values()].sort((a, b) =>
    a.providerTag.localeCompare(b.providerTag),
  );
}
