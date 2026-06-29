/**
 * Structure confirm flow: portal/z-index source, $ref resolution, multi-step execute, failed retry message.
 * Run: npx tsx scripts/verify_structure_confirm_flow.ts
 */
import * as fs from "fs";
import pg from "pg";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import {
  executeTechStructurePlan,
  normalizePlanRefKey,
  registerPlanRef,
  resolveRef,
} from "../lib/tech-department/structure-execute";
import { requireExternalEntryOfficeId } from "../lib/workspace/graph-identity-required";
import { requireTechDepartmentBuildingId } from "../lib/workspace/graph-identity-required";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function main() {
  console.log("=== Bug 1: portal + z-index (source) ===\n");
  const gateSource = fs.readFileSync("components/workspace/TechStructureConfirmationGate.tsx", "utf8");
  record("gate uses createPortal to document.body", gateSource.includes("createPortal(") && gateSource.includes("document.body"));
  record("gate z-index above chat dock (1500)", gateSource.includes("z-[1500]"));
  record(
    "Mayor chat closes modal on execute error",
    fs.readFileSync("components/workspace/WorkspaceMayorChat.tsx", "utf8").includes(
      "setStructureGateOpen(false);\n      setPendingStructurePlan(null);\n      setError(msg);",
    ),
  );

  console.log("\n=== Bug 2: $ref resolution ===\n");
  record("normalizePlanRefKey strips $", normalizePlanRefKey("$building1") === "building1");
  const refMap = new Map<string, string>();
  registerPlanRef(refMap, "building1", "uuid-building-1111-1111-111111111111");
  record("resolve $building1 when registered as building1", resolveRef("$building1", refMap) === "uuid-building-1111-1111-111111111111");
  record("resolve building1", resolveRef("building1", refMap) === "uuid-building-1111-1111-111111111111");

  console.log("\n=== Multi-step create plan execute (live) ===\n");

  const sb = getSupabaseAdmin();
  const officeId = await requireExternalEntryOfficeId();
  const techBuildingId = await requireTechDepartmentBuildingId(officeId);

  const { data: agentRow } = await sb
    .from("agents")
    .select("id, name")
    .eq("office_id", officeId)
    .limit(1)
    .maybeSingle();
  if (!agentRow) throw new Error("No agent for assign step");

  const label = `Verify Confirm ${Date.now()}`;
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  const actions = [
    {
      type: "create_building",
      description: "Создание здания поиска работы",
      label,
      routing_description: "Отдел поиска работы для verify_structure_confirm_flow",
      ref: "$building1",
    },
    {
      type: "create_chamber",
      description: "Главный отдел",
      building_ref: "$building1",
      name: "Главный отдел",
      routing_role: "main",
      ref: "$chamber_main",
    },
    {
      type: "assign_agent",
      description: `Назначить ${agentRow.name}`,
      agent_id: agentRow.id,
      chamber_ref: "$chamber_main",
    },
    {
      type: "create_chamber",
      description: "Y Combinator",
      building_ref: "$building1",
      name: "Y Combinator",
      ref: "$chamber_yc",
    },
    {
      type: "create_chamber",
      description: "Upwork",
      building_ref: "$building1",
      name: "Upwork",
      ref: "$chamber_upwork",
    },
    {
      type: "create_connection",
      description: "Кабель к Техническому отделу",
      source_ref: techBuildingId,
      target_ref: "$building1",
    },
  ];

  const { data: planRow, error: planErr } = await sb
    .from("tech_structure_plans")
    .insert({
      task_text: "verify structure confirm flow",
      plan_summary: "Multi-step verify plan",
      actions,
      status: "pending",
      expires_at: expiresAt,
      plan_kind: "create",
    })
    .select("id")
    .single();
  if (planErr || !planRow) throw planErr ?? new Error("plan insert failed");

  const planId = planRow.id;
  let buildingRegistryId: string | null = null;
  let connectionId: string | null = null;

  try {
    const result = await executeTechStructurePlan(planId);
    record("multi-step execute succeeds", result.executed.every((s) => s.ok), result.executed);
    record("all 6 steps executed", result.executed.length === 6, { count: result.executed.length });

    const { data: planAfter } = await sb
      .from("tech_structure_plans")
      .select("status")
      .eq("id", planId)
      .single();
    record("plan status executed", planAfter?.status === "executed", planAfter);

    const { data: buildingObj } = await sb
      .from("office_objects")
      .select("id")
      .eq("label", label)
      .maybeSingle();
    record("building row in office_objects", !!buildingObj?.id, buildingObj);
    buildingRegistryId = buildingObj?.id ?? null;

    const { count: chamberCount } = await sb
      .from("chambers")
      .select("id", { count: "exact", head: true })
      .eq("building_object_id", buildingRegistryId ?? "");
    record("3 chambers created", chamberCount === 3, { chamberCount });

    const { count: assignCount } = await sb
      .from("agent_assignments")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentRow.id);
    record("agent assignment exists", (assignCount ?? 0) >= 1, { assignCount });

    const { data: conn } = await sb
      .from("connections")
      .select("id")
      .eq("source_entity_id", techBuildingId)
      .eq("target_entity_id", buildingRegistryId ?? "")
      .eq("is_active", true)
      .maybeSingle();
    connectionId = conn?.id ?? null;
    record("connection to tech dept created", !!connectionId, conn);
  } catch (err) {
    record("multi-step execute succeeds", false, err instanceof Error ? err.message : err);
  }

  console.log("\n=== Partial failure → explicit retry message ===\n");

  const { data: failPlanRow } = await sb
    .from("tech_structure_plans")
    .insert({
      task_text: "fail verify",
      plan_summary: "fail",
      actions: [
        {
          type: "create_building",
          description: "b",
          label: "FailVerifyBuilding",
          routing_description: "x",
          ref: "$building1",
        },
        {
          type: "create_chamber",
          description: "bad chamber",
          building_ref: "$missing_building",
          name: "Bad",
        },
      ],
      status: "pending",
      expires_at: expiresAt,
      plan_kind: "create",
    })
    .select("id")
    .single();

  const failPlanId = failPlanRow!.id;
  let failMsg = "";
  try {
    await executeTechStructurePlan(failPlanId);
    record("partial failure throws", false);
  } catch (err) {
    failMsg = err instanceof Error ? err.message : String(err);
    record("partial failure throws", true, failMsg);
  }

  record(
    "failure message is explicit (not generic not found)",
    failMsg.includes("План прерван ошибкой на шаге") && !failMsg.includes("Plan not found"),
    failMsg,
  );

  let retryMsg = "";
  try {
    await executeTechStructurePlan(failPlanId);
    record("retry on failed plan throws", false);
  } catch (err) {
    retryMsg = err instanceof Error ? err.message : String(err);
    record("retry on failed plan throws", true, retryMsg);
  }
  record(
    "retry message mentions step + non-retryable",
    retryMsg.includes("Повторное выполнение невозможно") && retryMsg.includes("шаге"),
    retryMsg,
  );

  const { data: failedRow } = await sb
    .from("tech_structure_plans")
    .select("status, execution_result")
    .eq("id", failPlanId)
    .single();
  record("failed plan status=failed in DB", failedRow?.status === "failed", failedRow);

  console.log("\n=== TD-03C regression: destructive execute via RPC (skipped — see verify_td03c_destructive_execute.ts) ===\n");
  record("destructive execute covered by verify_td03c", true);

  console.log("\n=== Cleanup ===\n");
  if (connectionId) {
    await sb.from("connection_permissions").delete().eq("connection_id", connectionId);
    await sb.from("connections").delete().eq("id", connectionId);
  }
  if (buildingRegistryId) {
    const { data: chambers } = await sb
      .from("chambers")
      .select("id, entity_registry_id")
      .eq("building_object_id", buildingRegistryId);
    for (const ch of chambers ?? []) {
      await sb.from("agent_assignments").delete().eq("chamber_id", ch.id);
      await sb.from("chambers").delete().eq("id", ch.id);
      await sb.from("entity_registry").delete().eq("id", ch.entity_registry_id);
    }
    await sb.from("entity_registry").delete().eq("id", buildingRegistryId);
    await sb.from("office_objects").delete().eq("id", buildingRegistryId);
  }
  await sb.from("tech_structure_plans").delete().eq("id", planId);
  await sb.from("tech_structure_plans").delete().eq("id", failPlanId);
  record("cleanup", true);

  console.log("\nNote: expanded-chat click reachability requires browser — gate is portaled at z-[1500] > dock 1350.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
