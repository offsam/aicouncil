#!/usr/bin/env npx tsx
import * as fs from "fs";
import * as path from "path";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase/admin";
import { invokeChamberAgentWithFreeFallback } from "../lib/chamber-agent-invoke";
import { resolveRoute } from "../lib/routing";
import { GENERAL_INTAKE_ID } from "../lib/route-agent-ids";
import { selectAgentForChamberEntity } from "../lib/agent-selection";

async function main() {
  const report: Record<string, unknown> = { at: new Date().toISOString() };

  if (!isSupabaseConfigured()) {
    console.error("Supabase not configured — set .env.local");
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();

  // Part 6: General Intake fallback + routing_logs
  const nonsense = `w7-fallback-${Date.now()} xyzzy plugh nonsense`;
  const route = await resolveRoute(nonsense);
  report.part6_resolveRoute = {
    target: route.targets[0]?.entityRegistryId ?? null,
    method: route.method,
    routingLogId: route.routingLogId ?? null,
    isGeneralIntake: route.targets[0]?.entityRegistryId === GENERAL_INTAKE_ID,
  };

  if (route.routingLogId) {
    const { data: logRow } = await supabase
      .from("routing_logs")
      .select("id, task_text, method, chosen_target_entity_registry_id")
      .eq("id", route.routingLogId)
      .maybeSingle();
    report.part6_routing_log_sql = logRow;
  }

  // Part 7: knowledge table (not knowledge_base)
  const testTitle = `w7-knowledge-${Date.now()}`;
  const { data: chamber } = await supabase
    .from("chambers")
    .select("entity_registry_id")
    .limit(1)
    .maybeSingle();

  if (chamber?.entity_registry_id) {
    const { data: entry, error: insertErr } = await supabase
      .from("knowledge")
      .insert({
        entity_type: "chamber",
        entity_id: chamber.entity_registry_id,
        entity_registry_id: chamber.entity_registry_id,
        title: testTitle,
        content: "evidence row",
      })
      .select("id")
      .single();

    report.part7_insert = { ok: !insertErr, id: entry?.id, error: insertErr?.message };

    if (entry?.id) {
      const { data: inLegacy } = await supabase
        .from("knowledge_base")
        .select("id")
        .eq("id", entry.id)
        .maybeSingle();
      report.part7_sql = { in_knowledge: entry.id, in_knowledge_base: inLegacy?.id ?? null };
      await supabase.from("knowledge").delete().eq("id", entry.id);
    }
  }

  // Part 2: free agent fallback (force primary failure)
  const targetId = route.targets[0]?.entityRegistryId ?? GENERAL_INTAKE_ID;
  const primary = await selectAgentForChamberEntity(targetId);
  if (primary) {
    try {
      const invoked = await invokeChamberAgentWithFreeFallback({
        chamberRegistryId: targetId,
        question: "Say OK",
        forceError: true,
        primaryAgent: primary,
      });
      report.part2_fallback = {
        governmentFallback: invoked.governmentFallback,
        reserveSlug: invoked.agent.slug,
        answerPreview: invoked.answer.slice(0, 80),
      };
    } catch (err) {
      report.part2_fallback = {
        error: err instanceof Error ? err.message : String(err),
        note: "No free reserve in chamber — expected for some rosters",
      };
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
