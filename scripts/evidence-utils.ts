import { execSync } from "child_process";

export function isProviderError(text: string): boolean {
  return /Rate limit|quota|429|TPD|too many requests|resource exhausted|tokens per day|Ни один эксперт не смог/i.test(
    text,
  );
}

export async function probeProviders(base = "http://localhost:3000"): Promise<boolean> {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskText: "provider ping", executionMode: "fast" }),
  });
  const data = (await res.json()) as { error?: string; answer?: string };
  return isProviderError(String(data.error ?? "") + String(data.answer ?? ""));
}

/** Playwright: Mayor chat dock (bottom), not inspector. */
export function workspaceChatRoot(page: import("playwright").Page) {
  return page.locator('[data-testid="workspace-mayor-chat"]');
}

export function workspaceChatMessages(page: import("playwright").Page) {
  return workspaceChatRoot(page).locator(".whitespace-pre-wrap");
}

export function workspaceChatMeta(page: import("playwright").Page) {
  return workspaceChatRoot(page).locator(".text-\\[10px\\].text-stone-500");
}

export function workspaceChatError(page: import("playwright").Page) {
  return workspaceChatRoot(page).locator(".text-red-400");
}

/** @deprecated use workspaceChatRoot — left sidebar chat removed */
export function chatAside(page: import("playwright").Page) {
  return workspaceChatRoot(page);
}

export async function waitForWorkspaceReady(page: import("playwright").Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector(".workspace-flow") !== null,
    { timeout: 120000 },
  );
}

export async function dismissWorkspaceInspector(page: import("playwright").Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.locator('[aria-label="Закрыть панель"]').click({ force: true }).catch(() => undefined);
  await page
    .locator('[data-testid="workspace-inspector-close"]')
    .click({ force: true })
    .catch(() => undefined);
  await page.waitForTimeout(200);
}

/** Open workspace Mayor chat dock if collapsed; expand message history. */
export async function openWorkspaceChat(page: import("playwright").Page): Promise<void> {
  await dismissWorkspaceInspector(page);
  const dock = workspaceChatRoot(page);
  if ((await dock.count()) === 0) {
    await page.locator('[data-testid="workspace-chat-launcher"]').click({ force: true });
    await dock.waitFor({ state: "visible", timeout: 10000 });
  }
  const messages = dock.locator(".workspace-chat-dock-messages");
  if ((await messages.count()) === 0) {
    await page.locator('[data-testid="workspace-mayor-chat-expand"]').click();
    await messages.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
  }
}

export async function waitForWorkspaceChatDone(
  page: import("playwright").Page,
  timeout = 120000,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="workspace-mayor-chat"]');
      if (!root) return false;
      const msgs = root.querySelectorAll(".whitespace-pre-wrap");
      return msgs.length >= 2 && !document.body.textContent?.includes("Маршрутизация…");
    },
    { timeout },
  );
}

export function workspaceChatInput(page: import("playwright").Page) {
  return page.locator('[data-testid="workspace-mayor-chat-input"]');
}

export function workspaceChatSend(page: import("playwright").Page) {
  return page.locator('[data-testid="workspace-mayor-chat-send"]');
}

export async function selectWorkspaceChamber(
  page: import("playwright").Page,
  registryId: string,
): Promise<void> {
  const accent = page.locator(`[data-testid="workspace-chamber-accent-${registryId}"]`);
  if ((await accent.count()) > 0) {
    await accent.click({ force: true });
    return;
  }
  throw new Error(`Chamber accent not found for registry ${registryId}`);
}

export async function selectWorkspaceChamberTarget(
  page: import("playwright").Page,
  target: {
    officeId: string;
    buildingId: string;
    chamberId: string;
    registryId: string;
    label: string;
  },
): Promise<void> {
  await page.evaluate((payload) => {
    (
      window as { __workspaceSelectTarget?: (t: Record<string, string>) => void }
    ).__workspaceSelectTarget?.({
      kind: "chamber",
      officeId: payload.officeId,
      buildingId: payload.buildingId,
      chamberId: payload.chamberId,
      registryId: payload.registryId,
      label: payload.label,
    });
  }, target);
  await page.waitForTimeout(300);
}

/** Open inspector on first target, then expand to multi-select (dev hooks). */
export async function setWorkspaceMultiSelection(
  page: import("playwright").Page,
  targets: Array<Record<string, string | null>>,
): Promise<void> {
  if (targets.length === 0) return;
  const normalizeTarget = (target: Record<string, string | null>): Record<string, string> =>
    Object.entries(target).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value != null) acc[key] = value;
      return acc;
    }, {});

  await page.evaluate(({ first, all }) => {
    const w = window as {
      __workspaceSelectTarget?: (t: Record<string, string>) => void;
      __workspaceSetSelection?: (t: Array<Record<string, string>>) => void;
    };
    w.__workspaceSelectTarget?.(first);
    if (all.length > 1) w.__workspaceSetSelection?.(all);
  }, { first: normalizeTarget(targets[0]), all: targets.map(normalizeTarget) });
  await page.waitForTimeout(300);
}

export async function selectWorkspaceInspectorTarget(
  page: import("playwright").Page,
  target: Record<string, string>,
): Promise<void> {
  await page.evaluate((payload) => {
    (
      window as { __workspaceSelectTarget?: (t: Record<string, string>) => void }
    ).__workspaceSelectTarget?.(payload);
  }, target);
  await page.waitForTimeout(300);
}

export async function waitForMultiSelectUi(page: import("playwright").Page): Promise<boolean> {
  try {
    await page.waitForSelector('[data-testid="workspace-inspector-multi"]', { timeout: 8000 });
    return true;
  } catch {
    return (await page.locator('[data-testid="workspace-selection-count"]').count()) > 0;
  }
}

export async function multiSelectCountText(page: import("playwright").Page): Promise<string | null> {
  const inspector = page.locator('[data-testid="workspace-inspector-multi"]').getByText(/selected/);
  if ((await inspector.count()) > 0) {
    return inspector.textContent();
  }
  const toolbar = page.locator('[data-testid="workspace-selection-count"]');
  if ((await toolbar.count()) > 0) {
    return toolbar.textContent();
  }
  return null;
}

const PASS_SOUND = "/System/Library/Sounds/Glass.aiff";
const FAIL_SOUND = "/System/Library/Sounds/Basso.aiff";

/** Audible completion cue (Mac: say + afplay). Set EVIDENCE_NO_SOUND=1 to mute. */
export function notifyTaskComplete(pass: boolean, label?: string): void {
  if (process.env.EVIDENCE_NO_SOUND === "1") return;

  const message = label ?? (pass ? "Готово" : "Не прошло");

  if (process.platform === "darwin") {
    try {
      execSync(`say ${JSON.stringify(message)}`, { stdio: "ignore", timeout: 20000 });
    } catch {
      /* say unavailable */
    }
    try {
      execSync(`afplay ${JSON.stringify(pass ? PASS_SOUND : FAIL_SOUND)}`, {
        stdio: "ignore",
        timeout: 8000,
      });
    } catch {
      /* afplay unavailable */
    }
    return;
  }

  try {
    process.stderr.write("\u0007");
  } catch {
    /* ignore */
  }
}

/** Notify then exit — use instead of process.exit in evidence scripts. */
export function exitEvidence(code: number, label?: string): never {
  notifyTaskComplete(code === 0, label);
  process.exit(code);
}
