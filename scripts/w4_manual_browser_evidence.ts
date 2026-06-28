/**
 * W4 evidence — chat sidebar + route highlight on /workspace
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import { ensureW4W9TestInfra, loadEnvLocal } from "../lib/w4-w9-test-infra";
import {
  exitEvidence,
  isProviderError,
  openWorkspaceChat,
  selectWorkspaceChamberTarget,
  waitForWorkspaceChatDone,
  waitForWorkspaceReady,
  workspaceChatError,
  workspaceChatInput,
  workspaceChatMessages,
  workspaceChatMeta,
  workspaceChatSend,
} from "./evidence-utils";

loadEnvLocal();

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w4");

async function submitChat(page: import("playwright").Page, text: string) {
  await openWorkspaceChat(page);
  const input = workspaceChatInput(page);
  await input.waitFor({ timeout: 10000 });
  await input.fill(text);
  await workspaceChatSend(page).click();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const infra = await ensureW4W9TestInfra(supabase, BASE);
  const testChamber = infra.chambers.primary;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/workspace`, { waitUntil: "load", timeout: 60000 });
  await waitForWorkspaceReady(page);
  await page.locator(".react-flow__controls-fitview").click().catch(() => undefined);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "01-initial-workspace.png"), fullPage: false });

  await selectWorkspaceChamberTarget(page, {
    officeId: AI_COUNCIL_OFFICE_ID,
    buildingId: infra.buildingId,
    chamberId: testChamber.id,
    registryId: testChamber.entity_registry_id,
    label: testChamber.name,
  });
  await page.waitForTimeout(400);

  await submitChat(page, "Напиши короткий caption для Instagram");

  await waitForWorkspaceChatDone(page, 120000);

  const chatError = await workspaceChatError(page).count();
  const assistantAfterFirst = await workspaceChatMessages(page)
    .last()
    .textContent()
    .catch(() => "");
  if (chatError > 0 || isProviderError(assistantAfterFirst ?? "")) {
    const errText =
      chatError > 0
        ? await workspaceChatError(page).last().textContent()
        : assistantAfterFirst;
    const report = {
      providerBlocked: true,
      error: errText,
      testChamber: testChamber.name,
      testChamberRegistryId: testChamber.entity_registry_id,
      checks: {
        chat_response: false,
        route_meta: false,
        route_badges: false,
        highlight_after_refresh: false,
      },
      note: "Agent provider unavailable — route highlight checks skipped (non-blocker for W10B code)",
    };
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    return;
  }
  await page.screenshot({ path: path.join(OUT, "02-chat-response.png"), fullPage: false });

  const routeBadges = page.locator(".workspace-route-step-badge");
  await routeBadges.first().waitFor({ timeout: 5000 });
  const badgeCount = await routeBadges.count();

  const chatMeta = await workspaceChatMeta(page).last().textContent();
  const assistantText = await workspaceChatMessages(page).last().textContent();

  await page.screenshot({ path: path.join(OUT, "03-route-highlight.png"), fullPage: false });

  await page.reload({ waitUntil: "load", timeout: 60000 });
  await waitForWorkspaceReady(page);
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });
  await selectWorkspaceChamberTarget(page, {
    officeId: AI_COUNCIL_OFFICE_ID,
    buildingId: infra.buildingId,
    chamberId: testChamber.id,
    registryId: testChamber.entity_registry_id,
    label: testChamber.name,
  });
  await page.waitForTimeout(400);
  await submitChat(page, "Сделай короткий пост для Instagram");

  await waitForWorkspaceChatDone(page, 120000);

  const chatError2 = await workspaceChatError(page).count();
  if (chatError2 > 0) {
    const report = {
      testChamber: testChamber.name,
      testChamberRegistryId: testChamber.entity_registry_id,
      badgeCount,
      badgeAfterRefresh: 0,
      chatMeta,
      assistantTextPreview: assistantText?.slice(0, 200),
      providerBlockedSecondChat: true,
      checks: {
        chat_response: Boolean(assistantText && assistantText.length > 5),
        route_meta: Boolean(chatMeta?.includes("City Hall") && chatMeta?.includes("→")),
        route_badges: badgeCount >= 2,
        highlight_after_refresh: false,
      },
    };
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    await browser.close();
    exitEvidence(1);
  }

  await page.waitForTimeout(800);
  const routeBadgesAfter = page.locator(".workspace-route-step-badge");
  try {
    await routeBadgesAfter.first().waitFor({ timeout: 8000 });
  } catch {
    /* badges may be absent if chat failed */
  }
  await page.screenshot({ path: path.join(OUT, "04-after-refresh-chat.png"), fullPage: false });

  const badgeAfterRefresh = await routeBadgesAfter.count();

  const report = {
    testChamber: testChamber.name,
    testChamberRegistryId: testChamber.entity_registry_id,
    badgeCount,
    badgeAfterRefresh,
    chatMeta,
    assistantTextPreview: assistantText?.slice(0, 200),
    checks: {
      chat_response: Boolean(assistantText && assistantText.length > 5),
      route_meta: Boolean(chatMeta?.includes("City Hall") && chatMeta?.includes("→")),
      route_badges: badgeCount >= 2,
      highlight_after_refresh: badgeAfterRefresh >= 2,
    },
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  const failed = Object.values(report.checks).some((v) => !v);
  if (failed) exitEvidence(1);
}

main().catch((e) => {
  console.error(e);
  exitEvidence(1);
});
