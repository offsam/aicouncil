/**
 * Check if connection SVG paths exist in workspace DOM.
 * Run: npx tsx scripts/debug_workspace_edges_dom.ts
 */
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto("http://localhost:3000/workspace", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const edgeCount = document.querySelector("[data-testid='workspace-edge-count']")?.textContent;
    const connCount = document.querySelector("[data-testid='workspace-connection-count']")?.textContent;
    const pipes = document.querySelectorAll(".workspace-connection-pipe");
    const outers = document.querySelectorAll(".workspace-connection-pipe-outer");
    const rfEdges = document.querySelectorAll(".react-flow__edge");
    const paths: string[] = [];
    pipes.forEach((p, i) => {
      if (i < 5) paths.push((p.getAttribute("d") || "").slice(0, 120));
    });
    const edgesLayer = document.querySelector(".react-flow__edges");
    const nodesLayer = document.querySelector(".react-flow__nodes");
    const es = edgesLayer ? getComputedStyle(edgesLayer) : null;
    const ns = nodesLayer ? getComputedStyle(nodesLayer) : null;
    const pipeStyle = pipes[0] ? getComputedStyle(pipes[0]) : null;
    return {
      edgeCount,
      connCount,
      pipeCount: pipes.length,
      outerCount: outers.length,
      rfEdgeCount: rfEdges.length,
      samplePaths: paths,
      edgesZ: es?.zIndex,
      edgesPosition: es?.position,
      nodesZ: ns?.zIndex,
      nodesPosition: ns?.position,
      pipeStroke: pipeStyle?.stroke,
      pipeOpacity: pipeStyle?.opacity,
      pipeDisplay: pipeStyle?.display,
      pipeVisibility: pipeStyle?.visibility,
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: "docs/evidence/cable-visibility-debug.png", fullPage: false });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
