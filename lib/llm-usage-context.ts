export type LlmUsageContext = {
  conversationId?: string | null;
  routingLogId?: string | null;
  executionMode?: string | null;
};

type AsyncLocalStorageLike = {
  run: <T>(store: LlmUsageContext, fn: () => Promise<T>) => Promise<T>;
  getStore: () => LlmUsageContext | undefined;
};

let storage: AsyncLocalStorageLike | null | undefined;

function getStorage(): AsyncLocalStorageLike | null {
  if (typeof window !== "undefined") return null;
  if (storage !== undefined) return storage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require("async_hooks") as {
      AsyncLocalStorage: new () => AsyncLocalStorageLike;
    };
    storage = new AsyncLocalStorage();
  } catch {
    storage = null;
  }
  return storage;
}

export function runWithLlmUsageContext<T>(
  ctx: LlmUsageContext,
  fn: () => Promise<T>,
): Promise<T> {
  const als = getStorage();
  if (!als) return fn();
  return als.run({ ...ctx }, fn);
}

export function getLlmUsageContext(): LlmUsageContext {
  const als = getStorage();
  return als?.getStore() ?? {};
}

export function patchLlmUsageContext(patch: Partial<LlmUsageContext>): void {
  const store = getStorage()?.getStore();
  if (!store) return;
  Object.assign(store, patch);
}
