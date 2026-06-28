/**
 * W8 evidence — workspace inspector panel
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w8");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: chambers } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id, building_object_id")
    .in("name", ["Instagram", "PDF Processing"]);
  const instagram = chambers?.find((c) => c.name === "Instagram");
  if (!instagram?.entity_registry_id) throw new Error("Instagram chamber not found");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });
  await page.waitForSelector('[data-testid="workspace-inspector"]', { timeout: 10000 });

  await page.locator('[data-testid="rf__node-city-hall"]').click({ force: true });
  await page.waitForSelector('[data-testid="workspace-inspector-kind-city"]', {
    timeout: 5000,
  });
  await page.screenshot({ path: path.join(OUT, "01-inspector-city.png") });

  await page
    .locator('[data-testid="workspace-inspector"]')
    .getByText("Knowledge Sources")
    .waitFor({ timeout: 10000 });
  const cityHasKnowledgeSources = await page
    .locator('[data-testid="workspace-inspector"]')
    .getByText("Knowledge Sources")
    .count();

  let buildingInspectorOpened = false;
  if (instagram.building_object_id) {
    const { data: buildingRow } = await supabase
      .from("office_objects")
      .select("id, label")
      .eq("id", instagram.building_object_id)
      .single();

    await page.evaluate(
      ({ officeId, buildingId, label }) => {
        (
          window as {
            __workspaceSelectTarget?: (target: {
              kind: string;
              officeId: string;
              buildingId: string;
              label: string;
            }) => void;
          }
        ).__workspaceSelectTarget?.({
          kind: "building",
          officeId,
          buildingId,
          label: label ?? "Building",
        });
      },
      {
        officeId: AI_COUNCIL_OFFICE_ID,
        buildingId: instagram.building_object_id,
        label: buildingRow?.label ?? "Building",
      },
    );
    await page.waitForSelector('[data-testid="workspace-inspector-kind-building"]', {
      timeout: 5000,
    });
    buildingInspectorOpened = true;
    await page.screenshot({ path: path.join(OUT, "07-inspector-building.png") });
  }

  async function selectChamber(registryId: string) {
    await page
      .locator(`[data-testid="workspace-chamber-accent-${registryId}"]`)
      .click({ force: true });
    await page.waitForSelector('[data-testid="workspace-inspector-kind-chamber"]', {
      timeout: 10000,
    });
  }

  await selectChamber(instagram.entity_registry_id);
  await page.waitForSelector('button:has-text("Save routing_description")', { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, "02-inspector-chamber-routing.png") });

  const testRouting = `W8 evidence routing ${Date.now()}`;
  await page
    .getByPlaceholder("routing_description for resolveRoute / workflow planner")
    .fill(testRouting);
  await page.getByRole("button", { name: "Save routing_description" }).click();
  await page.waitForTimeout(1200);

  const { data: regRow } = await supabase
    .from("entity_registry")
    .select("routing_description")
    .eq("id", instagram.entity_registry_id)
    .single();
  await page.screenshot({ path: path.join(OUT, "03-inspector-chamber-routing-saved.png") });

  await page
    .locator('[data-testid="workspace-inspector"] input[placeholder="New rule…"]')
    .fill("W8 evidence rule");
  await page
    .locator('[data-testid="workspace-inspector"]')
    .getByRole("button", { name: "Add", exact: true })
    .first()
    .click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "04-inspector-chamber-rules.png") });

  let agentInspectorOpened = false;
  const agentNode = page.locator('[data-testid^="workspace-agent-"]').first();
  if ((await agentNode.count()) > 0) {
    await agentNode.click({ force: true });
    await page.waitForSelector('[data-testid="workspace-inspector-kind-agent"]', {
      timeout: 10000,
    });
    agentInspectorOpened = true;
    await page.screenshot({ path: path.join(OUT, "05-inspector-agent.png") });
  }

  let connectionInspectorOpened = false;
  const edge = page.locator(".react-flow__edge-path").first();
  if ((await edge.count()) > 0) {
    await edge.click({ force: true });
    await page.waitForSelector('[data-testid="workspace-inspector-kind-connection"]', {
      timeout: 5000,
    });
    connectionInspectorOpened = true;
    await page.screenshot({ path: path.join(OUT, "06-inspector-connection.png") });
  }

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });
  await selectChamber(instagram.entity_registry_id);
  await page.waitForSelector('button:has-text("Save routing_description")', { timeout: 10000 });
  const routingAfterRefresh = await page
    .getByPlaceholder("routing_description for resolveRoute / workflow planner")
    .inputValue({ timeout: 10000 })
    .catch(() => "");
  await page.screenshot({ path: path.join(OUT, "08-after-edit-persist-refresh.png") });

  const hasInheritedKnowledge = await page
    .locator('[data-testid="workspace-inspector"]')
    .getByText("Inherited from City")
    .count();

  const report = {
    instagramRegistryId: instagram.entity_registry_id,
    testRouting,
    sqlRouting: regRow?.routing_description,
    routingAfterRefresh,
    checks: {
      city_inspector: cityHasKnowledgeSources >= 1,
      building_inspector: buildingInspectorOpened,
      chamber_routing_save: regRow?.routing_description === testRouting,
      chamber_knowledge_sources: hasInheritedKnowledge >= 1,
      refresh_persist: routingAfterRefresh === testRouting,
      agent_inspector: agentInspectorOpened,
      connection_inspector: connectionInspectorOpened,
    },
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  if (Object.values(report.checks).some((v) => !v)) exitEvidence(1);
}

main().catch((e) => {
  console.error(e);
  exitEvidence(1);
});
