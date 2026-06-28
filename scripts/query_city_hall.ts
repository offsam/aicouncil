import * as fs from "fs";
import { resolveCityHallMainAgent } from "../lib/workspace/city-hall-orchestrator";
import { buildContext } from "../lib/entity-registry";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";

// Load environment variables manually from .env.local
const envContent = fs.readFileSync(".env.local", "utf8");
for (const line of envContent.split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function run() {
  console.log("=== CITY HALL MAIN AGENT AND CONTEXT TEST ===");
  const mainAgent = await resolveCityHallMainAgent(AI_COUNCIL_OFFICE_ID);
  if (!mainAgent) {
    console.log("City Hall main agent not found.");
    return;
  }
  console.log("City Hall Main Agent resolved:", JSON.stringify(mainAgent, null, 2));

  console.log("\nCalling buildContext...");
  const context = await buildContext(mainAgent.agentId, {
    chamberRegistryId: mainAgent.chamberRegistryId,
  });

  console.log("\n=== buildContext() JSON RESULT ===");
  console.log(JSON.stringify({
    layers: context.layers,
    tokenEstimate: context.tokenEstimate
  }, null, 2));

  console.log("\n=== buildContext() flattenedPrompt ===");
  console.log(context.flattenedPrompt);
}

run().catch(console.error);
