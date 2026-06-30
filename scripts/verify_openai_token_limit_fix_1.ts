/**
 * DEBATE-PROVIDER-FIX-1: OpenAI max_tokens vs max_completion_tokens rules + debate smoke.
 * Run: npx tsx scripts/verify_openai_token_limit_fix_1.ts [baseUrl]
 */
import * as fs from "fs";
import {
  buildOpenAiTokenLimitFields,
  openAiUsesMaxCompletionTokens,
} from "../lib/openai-token-limit";
import type { CostTier } from "../lib/cost-tier";
import { selectDebatePair } from "../lib/debate/select-debate-pair";
import { resolveCityHallDebateChambersByTier } from "../lib/workspace/resolve-city-hall-council-chamber";
import { getSupabaseAdmin } from "../lib/supabase/admin";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = process.argv[2] ?? "https://aicouncil-ashen.vercel.app";

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

function verifyPatterns() {
  record("gpt-4o uses max_tokens", !openAiUsesMaxCompletionTokens("gpt-4o"));
  record(
    "gpt-4o body field",
    "max_tokens" in buildOpenAiTokenLimitFields("gpt-4o", 2048),
  );
  record("o4-mini uses max_completion_tokens", openAiUsesMaxCompletionTokens("o4-mini"));
  record(
    "o4-mini body field",
    "max_completion_tokens" in buildOpenAiTokenLimitFields("o4-mini", 2048),
  );
  record("gpt-5.5 uses max_completion_tokens", openAiUsesMaxCompletionTokens("gpt-5.5"));
  record("o3 uses max_completion_tokens", openAiUsesMaxCompletionTokens("o3"));
  record("gpt-4o-mini uses max_tokens", !openAiUsesMaxCompletionTokens("gpt-4o-mini"));
}

async function agentDetail(agentId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("id, provider, model_id, cost_tier, name")
    .eq("id", agentId)
    .maybeSingle();
  return data;
}

async function smokeDebateTier(tier: CostTier) {
  const byTier = await resolveCityHallDebateChambersByTier();
  const chamber = byTier[tier];
  if (!chamber) {
    record(`${tier} debate chamber resolved`, false);
    return;
  }
  const pair = await selectDebatePair(chamber.chamberRegistryId, tier);
  const author = await agentDetail(pair.author.agentId);
  const reviewer = await agentDetail(pair.reviewer.agentId);

  const res = await fetch(`${BASE}/api/debate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: `DEBATE-PROVIDER-FIX-1 ${tier} ${Date.now()}`,
      tierMode: { tier },
      callerKind: "mayor",
    }),
  });
  const body = (await res.json()) as {
    error?: string;
    debateId?: string;
    closedReason?: string;
    rounds?: unknown[];
  };

  record(`${tier} debate HTTP success`, res.ok && !body.error, {
    status: res.status,
    error: body.error,
    closedReason: body.closedReason,
    rounds: body.rounds?.length,
    author: author
      ? {
          id: author.id,
          provider: author.provider,
          model_id: author.model_id,
          cost_tier: author.cost_tier,
        }
      : null,
    reviewer: reviewer
      ? {
          id: reviewer.id,
          provider: reviewer.provider,
          model_id: reviewer.model_id,
          cost_tier: reviewer.cost_tier,
        }
      : null,
  });
}

async function main() {
  console.log("=== Pattern rules ===");
  verifyPatterns();

  console.log("\n=== Live debate smoke (mid regression + cheap/premium fix) ===");
  console.log("Base URL:", BASE);
  await smokeDebateTier("mid");
  await smokeDebateTier("cheap");
  await smokeDebateTier("premium");

  if (process.exitCode === 1) {
    console.error("\nSome checks failed.");
  } else {
    console.log("\nAll verify_openai_token_limit_fix_1 checks passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
