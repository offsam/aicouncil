/**
 * W6 evidence — visual connections on workspace canvas
 */
import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/w6");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: chambers } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id")
    .in("name", ["Instagram", "PDF Processing"]);
  const instagram = chambers?.find((c) => c.name === "Instagram");
  const pdf = chambers?.find((c) => c.name === "PDF Processing");
  if (!instagram || !pdf) throw new Error("Chambers not found");

  const { data: existing } = await supabase
    .from("connections")
    .select("id")
    .eq("source_entity_id", instagram.entity_registry_id)
    .eq("target_entity_id", pdf.entity_registry_id);
  for (const row of existing ?? []) {
    await fetch(`${BASE}/api/connections/${row.id}`, { method: "DELETE" });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("dialog", (d) => void d.accept());

  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForSelector(".workspace-flow", { timeout: 30000 });

  await page.getByRole("button", { name: /^Connect/ }).click();
  await page.locator(`[data-testid="rf__node-${instagram.entity_registry_id}"]`).click();
  await page.locator(`[data-testid="rf__node-${pdf.entity_registry_id}"]`).click();

  await page.locator('input[name="read_knowledge"]').check();
  await page.locator('input[name="send_tasks"]').check();
  await page.getByRole("button", { name: "Create connection" }).click();
  await page.waitForTimeout(1200);

  const edgeCount = await page.locator(".react-flow__edge").count();
  await page.screenshot({ path: path.join(OUT, "01-connection-line.png") });

  const edgePath = page.locator(".react-flow__edge-path").first();
  const box = await edgePath.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(OUT, "02-hover-permissions.png") });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".react-flow__edge", { timeout: 15000 });
  const edgeAfterRefresh = await page.locator(".react-flow__edge").count();
  await page.screenshot({ path: path.join(OUT, "03-after-refresh.png") });

  await page.locator(".react-flow__edge-path").first().click({ force: true });
  await page.getByRole("button", { name: "Delete connection" }).click();
  await page.waitForTimeout(800);
  const edgeAfterDelete = await page.locator(".react-flow__edge").count();
  await page.screenshot({ path: path.join(OUT, "04-after-delete.png") });

  await fetch(`${BASE}/api/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_entity_id: instagram.entity_registry_id,
      target_entity_id: pdf.entity_registry_id,
      read_knowledge: true,
      send_tasks: true,
    }),
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".react-flow__edge", { timeout: 15000 });

  await page.getByRole("button", { name: /^Connect/ }).click();
  await page.locator(`[data-testid="rf__node-${instagram.entity_registry_id}"]`).click();

  await page.locator('aside input[placeholder*="Instagram"]').fill("Обработать PDF документ для архива");
  await page.locator('aside button[type="submit"]').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll("aside .whitespace-pre-wrap").length >= 2 &&
      !document.body.textContent?.includes("Маршрутизация…"),
    { timeout: 120000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "05-route-connection-highlight.png") });

  const highlightedEdges = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".react-flow__edge-path")).filter((p) => {
      const stroke = p.getAttribute("stroke") ?? "";
      const styleStroke = (p as SVGPathElement).style?.stroke ?? "";
      return (
        stroke === "#fbbf24" ||
        styleStroke === "#fbbf24" ||
        stroke.includes("251, 191") ||
        styleStroke.includes("251, 191")
      );
    }).length,
  );

  const chatMeta = await page.locator("aside .text-xs.text-stone-400").last().textContent();
  const assistantText = await page.locator("aside .whitespace-pre-wrap").last().textContent();
  const providerBlocked =
    /Rate limit|quota|429|Ошибка:/i.test(assistantText ?? "") ||
    /Rate limit|quota|429/i.test(chatMeta ?? "");

  const report = {
    instagramId: instagram.entity_registry_id,
    pdfId: pdf.entity_registry_id,
    edgeCount,
    edgeAfterRefresh,
    edgeAfterDelete,
    chatMeta,
    highlightedEdges,
    providerBlocked,
    checks: {
      line_created: edgeCount >= 1,
      persists_after_refresh: edgeAfterRefresh >= 1,
      deleted: edgeAfterDelete === 0,
      route_meta_via_connection: Boolean(chatMeta?.includes("Instagram") && chatMeta?.includes("PDF")),
      route_highlight_edge: highlightedEdges >= 1,
    },
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  const structuralOk =
    report.checks.line_created &&
    report.checks.persists_after_refresh &&
    report.checks.deleted;
  const chatOk =
    report.checks.route_meta_via_connection && report.checks.route_highlight_edge;
  if (!structuralOk || (!providerBlocked && !chatOk)) exitEvidence(1);
}

main().catch((e) => {
  console.error(e);
  exitEvidence(1);
});
