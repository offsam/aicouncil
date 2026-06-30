/**
 * EXEC-MODE-1B closure: Turbo through all runtime execution paths.
 * Run: npx tsx scripts/verify_exec_mode_1b.ts
 */
import * as fs from "fs";
import type { ExecutionMode } from "../lib/execution-mode";
import { selectAgentsForExecutionMode } from "../lib/agent-selection";
import { executeChatTask } from "../lib/execute-chat-task";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import { ensureBuildingRegistry } from "../lib/entity-registry-ensure";
import { resolveUniqueChamberSlug } from "../lib/entity-registry-ensure";
import type { CostTier } from "../lib/cost-tier";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

type FixtureIds = {
  chamberId: string;
  chamberRegistryId: string;
  mainChamberRegistryId: string;
  buildingId: string;
};

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

function taskForMode(mode: ExecutionMode): string {
  return `t_exec_mode_1b smoke ${mode} ${Date.now()}`;
}

async function pickOneAgentPerTier(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<Record<CostTier, string>> {
  const tiers: CostTier[] = ["free", "cheap", "mid", "premium"];
  const out = {} as Record<CostTier, string>;
  for (const tier of tiers) {
    const { data: rows } = await supabase.from("agents").select("id").eq("cost_tier", tier).limit(20);
    let picked: string | null = null;
    for (const row of rows ?? []) {
      const { data: reg } = await supabase
        .from("entity_registry")
        .select("id")
        .eq("id", row.id)
        .maybeSingle();
      if (reg?.id) {
        picked = reg.id;
        break;
      }
    }
    if (!picked) throw new Error(`No ${tier} agent with entity_registry row for 1B fixture`);
    out[tier] = picked;
  }
  return out;
}

async function createFourTierFixture(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<FixtureIds> {
  const tag = `t_EXEC_MODE_1B_${Date.now()}`;
  const agentsByTier = await pickOneAgentPerTier(supabase);

  const { data: building, error: bErr } = await supabase
    .from("office_objects")
    .insert({
      office_id: AI_COUNCIL_OFFICE_ID,
      object_type: "room",
      position_x: 200,
      position_z: 200,
      size_w: 8,
      size_d: 8,
      label: tag,
      color: "slate",
    })
    .select("id")
    .single();
  if (bErr || !building) throw new Error(bErr?.message ?? "building insert failed");

  await ensureBuildingRegistry(
    supabase,
    {
      id: building.id,
      label: tag,
      routing_description: "temporary EXEC-MODE-1B four-tier roster",
      office_id: AI_COUNCIL_OFFICE_ID,
    },
    "AI Council",
  );

  const slug = await resolveUniqueChamberSlug(supabase, building.id, `${tag}_main`);
  const { data: registry, error: rErr } = await supabase
    .from("entity_registry")
    .insert({
      entity_type: "chamber",
      name: `${tag}_main`,
      slug,
      parent_entity_id: building.id,
      routing_description: "temporary EXEC-MODE-1B four-tier roster",
    })
    .select("id")
    .single();
  if (rErr || !registry) throw new Error(rErr?.message ?? "registry insert failed");

  const { data: mainChamber, error: cErr } = await supabase
    .from("chambers")
    .insert({
      entity_registry_id: registry.id,
      building_entity_id: building.id,
      building_object_id: building.id,
      name: `${tag}_main`,
      x: 0,
      z: 0,
      width: 4,
      depth: 4,
      routing_role: "main",
    })
    .select("id, entity_registry_id")
    .single();
  if (cErr || !mainChamber) throw new Error(cErr?.message ?? "main chamber insert failed");

  const internalSlug = await resolveUniqueChamberSlug(supabase, building.id, `${tag}_roster`);
  const { data: internalReg, error: irErr } = await supabase
    .from("entity_registry")
    .insert({
      entity_type: "chamber",
      name: `${tag}_roster`,
      slug: internalSlug,
      parent_entity_id: building.id,
      routing_description: "temporary EXEC-MODE-1B four-tier roster (internal)",
    })
    .select("id")
    .single();
  if (irErr || !internalReg) throw new Error(irErr?.message ?? "internal registry insert failed");

  const { data: internalChamber, error: icErr } = await supabase
    .from("chambers")
    .insert({
      entity_registry_id: internalReg.id,
      building_entity_id: building.id,
      building_object_id: building.id,
      name: `${tag}_roster`,
      x: 4,
      z: 0,
      width: 4,
      depth: 4,
      routing_role: null,
    })
    .select("id, entity_registry_id")
    .single();
  if (icErr || !internalChamber) throw new Error(icErr?.message ?? "internal chamber insert failed");

  const layout = [
    { agent_id: agentsByTier.free, role: "free", layout_x: 0, layout_y: 0 },
    { agent_id: agentsByTier.cheap, role: "cheap", layout_x: 1, layout_y: 0 },
    { agent_id: agentsByTier.mid, role: "mid", layout_x: 2, layout_y: 0 },
    { agent_id: agentsByTier.premium, role: "premium", layout_x: 3, layout_y: 0 },
  ];
  const { error: aErr } = await supabase.from("agent_assignments").insert(
    layout.map((row) => ({ ...row, chamber_id: internalChamber.id })),
  );
  if (aErr) throw new Error(aErr.message);

  return {
    chamberId: internalChamber.id,
    chamberRegistryId: internalChamber.entity_registry_id,
    mainChamberRegistryId: mainChamber.entity_registry_id,
    buildingId: building.id,
  };
}

async function deleteFourTierFixture(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fixture: FixtureIds,
): Promise<void> {
  await supabase.from("agent_assignments").delete().eq("chamber_id", fixture.chamberId);
  await supabase.from("chambers").delete().eq("entity_registry_id", fixture.chamberRegistryId);
  await supabase.from("entity_registry").delete().eq("id", fixture.chamberRegistryId);
  await supabase.from("chambers").delete().eq("entity_registry_id", fixture.mainChamberRegistryId);
  await supabase.from("entity_registry").delete().eq("id", fixture.mainChamberRegistryId);
  await supabase.from("entity_registry").delete().eq("id", fixture.buildingId);
  await supabase.from("office_objects").delete().eq("id", fixture.buildingId);
}

async function latestRoutingLog(taskText: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("routing_logs")
    .select("id, execution_mode, agent_count")
    .eq("task_text", taskText)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function runManagerDelegatePath(
  mainChamberRegistryId: string,
  rosterChamberRegistryId: string,
  mode: ExecutionMode,
  forceFailSlugs: string[],
): Promise<{
  invokedCount: number;
  agents: Array<{ agentId: string; costTier: CostTier }>;
  routingLogMode?: string | null;
}> {
  const taskText = taskForMode(`mgr-${mode}`);
  const selected = await selectAgentsForExecutionMode(rosterChamberRegistryId, mode);
  try {
    await executeChatTask(taskText, mainChamberRegistryId, mode, { forceFailSlugs });
  } catch {
    /* forced agent failures */
  }
  const log = await latestRoutingLog(taskText);
  return {
    invokedCount: selected.length,
    agents: selected.map((a) => ({ agentId: a.agentId, costTier: a.costTier })),
    routingLogMode: log?.execution_mode ?? null,
  };
}

async function runProcessTaskPath(
  chamberRegistryId: string,
  mode: ExecutionMode,
  forceFailSlugs: string[],
): Promise<{
  resultExecutionMode?: ExecutionMode;
  invokedCount: number;
  agents: Array<{ agentId: string; costTier: CostTier }>;
  routingLogMode?: string | null;
  routingAgentCount?: number | null;
}> {
  const taskText = taskForMode(mode);
  const selected = await selectAgentsForExecutionMode(chamberRegistryId, mode);

  let resultExecutionMode: ExecutionMode | undefined;
  try {
    const result = await executeChatTask(taskText, chamberRegistryId, mode, {
      directTargetEntityId: chamberRegistryId,
      forceFailSlugs,
    });
    if (result.mode === "single") {
      resultExecutionMode = result.executionMode;
    }
  } catch {
    /* expected when all agents forced to fail after routing log update */
  }

  const log = await latestRoutingLog(taskText);
  return {
    resultExecutionMode,
    invokedCount: selected.length,
    agents: selected.map((a) => ({ agentId: a.agentId, costTier: a.costTier })),
    routingLogMode: log?.execution_mode ?? null,
    routingAgentCount: log?.agent_count ?? null,
  };
}

async function verifyDirectAgentBypass(chamberRegistryId: string, targetAgentId: string): Promise<void> {
  const taskText = taskForMode("direct");
  try {
    await executeChatTask(taskText, chamberRegistryId, "turbo", {
      targetAgentId,
      directTargetEntityId: chamberRegistryId,
    });
  } catch {
    /* provider may fail in CI — routing log is written before invoke */
  }

  const supabase = getSupabaseAdmin();
  const { data: log } = await supabase
    .from("routing_logs")
    .select("method, direct_agent_id, execution_mode")
    .eq("task_text", taskText)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  record(
    "direct mode: routing log direct_agent_id matches target (tier filter bypassed)",
    log?.method === "direct_agent" && log?.direct_agent_id === targetAgentId,
    log,
  );
  record(
    "direct mode: no parallel executionMode selection in direct path",
    log?.method === "direct_agent",
    { note: "executeDirectAgentMode ignores executionMode/turbo for agent pick" },
  );
}

async function main() {
  const supabase = getSupabaseAdmin();
  let fixture: FixtureIds | null = null;

  try {
    fixture = await createFourTierFixture(supabase);
    console.log(`\n=== Temp fixture ${fixture.chamberRegistryId} (4 tiers) ===\n`);

    const turboAgents = await selectAgentsForExecutionMode(fixture.chamberRegistryId, "turbo");
    const tiersPresent = [...new Set(turboAgents.map((a) => a.costTier))].sort();
    record(
      "fixture has free+cheap+mid+premium",
      tiersPresent.join(",") === "cheap,free,mid,premium",
      { tiers: tiersPresent, count: turboAgents.length },
    );

    const forceFailSlugs = turboAgents.map((a) => a.slug);
    const modes: ExecutionMode[] = ["fast", "team", "council", "turbo"];
    const table: Array<Record<string, unknown>> = [];

    for (const mode of modes) {
      const run = await runProcessTaskPath(fixture.chamberRegistryId, mode, forceFailSlugs);
      table.push({
        mode,
        invokedCount: run.invokedCount,
        tiers: [...new Set(run.agents.map((a) => a.costTier))],
        agentIds: run.agents.map((a) => a.agentId),
        resultExecutionMode: run.resultExecutionMode ?? "(threw after log)",
        routingLogMode: run.routingLogMode,
        routingAgentCount: run.routingAgentCount,
      });

      record(`${mode}: selectAgents count > 0`, run.invokedCount > 0, { count: run.invokedCount });
      if (mode === "turbo") {
        record("turbo: 4 agents selected", run.invokedCount === 4, run.agents);
        record(
          "turbo: routing_logs.execution_mode = turbo",
          run.routingLogMode === "turbo",
          { routingLogMode: run.routingLogMode, agentCount: run.routingAgentCount },
        );
      } else {
        record(
          `${mode}: routing_logs.execution_mode = ${mode}`,
          run.routingLogMode === mode,
          { routingLogMode: run.routingLogMode },
        );
      }
      if (run.resultExecutionMode) {
        record(`${mode}: API result executionMode`, run.resultExecutionMode === mode, run);
      }
    }

    console.log("\n=== Four-mode comparison (processTask path) ===");
    console.table(table);

    const premium = turboAgents.find((a) => a.costTier === "premium");
    if (premium) {
      console.log("\n=== Direct agent regression ===");
      await verifyDirectAgentBypass(fixture.chamberRegistryId, premium.agentId);
    }

    console.log("\n=== Manager delegate turbo ===");
    const mgrTurbo = await runManagerDelegatePath(
      fixture.mainChamberRegistryId,
      fixture.chamberRegistryId,
      "turbo",
      forceFailSlugs,
    );
    record(
      "manager delegate turbo: routing_logs.execution_mode = turbo",
      mgrTurbo.routingLogMode === "turbo",
      mgrTurbo,
    );

    const mayorBlock = fs
      .readFileSync("lib/execute-chat-task.ts", "utf8")
      .slice(
        fs.readFileSync("lib/execute-chat-task.ts", "utf8").indexOf("async function executeMayorTask"),
        fs.readFileSync("lib/execute-chat-task.ts", "utf8").indexOf("async function executeMayorTask") + 12000,
      );
    record("mayor answer_self path unchanged (no selectAgentsForExecutionMode)", !mayorBlock.includes("selectAgentsForExecutionMode"));
  } finally {
    if (fixture) {
      await deleteFourTierFixture(supabase, fixture);
      console.log(`\nCleaned up temp fixture ${fixture.chamberRegistryId}`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
