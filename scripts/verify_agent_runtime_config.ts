/**
 * Verify every agent uses configured provider/model via loadAgentRuntimeConfig (item 1 universal).
 * Run: npx tsx scripts/verify_agent_runtime_config.ts
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { loadAgentRuntimeConfig } from "../lib/agent-runtime-config";
import { resolveMayorChatTarget } from "../lib/telegram/mayor-chat-target";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const mayor = await resolveMayorChatTarget();
  if (!mayor?.targetAgentId) {
    console.error("FAIL: mayor target not resolved");
    process.exit(1);
  }

  const mayorConfig = await loadAgentRuntimeConfig(mayor.targetAgentId);
  if (mayorConfig.provider !== "anthropic") {
    console.error(`FAIL Mayor: expected anthropic, got ${mayorConfig.provider}`);
    process.exit(1);
  }
  console.log("PASS Mayor:", `${mayorConfig.provider}/${mayorConfig.modelId}`);

  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, name, provider, model_id");
  if (error) throw new Error(error.message);

  let unconfigured = 0;
  let mismatch = 0;
  for (const agent of agents ?? []) {
    if (!agent.provider?.trim() || !agent.model_id?.trim()) {
      unconfigured += 1;
      console.error(`FAIL unconfigured: ${agent.name ?? agent.id}`);
      continue;
    }
    const cfg = await loadAgentRuntimeConfig(agent.id);
    const dbProvider = agent.provider.trim().toLowerCase();
    if (cfg.provider !== dbProvider || cfg.modelId !== agent.model_id.trim()) {
      mismatch += 1;
      console.error(
        `FAIL mismatch ${agent.name}: db=${dbProvider}/${agent.model_id} runtime=${cfg.provider}/${cfg.modelId}`,
      );
    }
  }

  if (unconfigured > 0 || mismatch > 0) {
    console.error(`\nFAIL: ${mismatch} mismatches, ${unconfigured} unconfigured`);
    process.exit(1);
  }

  console.log(`PASS: all ${agents?.length ?? 0} agents match configured provider/model in runtime loader`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
