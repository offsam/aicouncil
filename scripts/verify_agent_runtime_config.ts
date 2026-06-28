/**
 * Verify agent invocations use configured provider/model from agents table (item 1).
 */
import * as fs from "fs";
import { loadAgentRuntimeConfig } from "../lib/agent-runtime-config";
import { resolveMayorChatTarget } from "../lib/telegram/mayor-chat-target";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function main() {
  const mayor = await resolveMayorChatTarget();
  if (!mayor?.targetAgentId) {
    console.error("FAIL: mayor target not resolved");
    process.exit(1);
  }

  const config = await loadAgentRuntimeConfig(mayor.targetAgentId);
  console.log("Mayor runtime config:", config);

  if (config.provider !== "anthropic") {
    console.error(`FAIL: expected provider anthropic, got ${config.provider}`);
    process.exit(1);
  }
  if (!config.modelId.includes("claude")) {
    console.error(`FAIL: expected claude model_id, got ${config.modelId}`);
    process.exit(1);
  }

  console.log("PASS: Mayor agent uses configured anthropic/claude from DB");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
