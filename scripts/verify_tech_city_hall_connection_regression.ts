/**
 * Phase 1C regression — Tech → City Hall connection seed.
 * Separate from verify_tech_city_hall_connection.ts (existence/permissions smoke).
 *
 * Asserts:
 * 1. Escalation activates (escalateToCityHall returns a record, not silent no-op).
 * 2. resolveRoute() with Tech Department *building* sourceEntityId does not return
 *    City Hall as a routing target (explicit check on decision.targets).
 *
 * Also reports connection-derived routing eligibility (mirrors resolveRoute step 0)
 * for diagnosis only — does not fail on that alone; fails only if resolveRoute targets
 * include City Hall.
 *
 * Run: npx tsx scripts/verify_tech_city_hall_connection_regression.ts
 */
import * as fs from "fs";
import { resolveCityHallBuildingId } from "../lib/workspace/graph-identity";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import { resolveRoute } from "../lib/routing";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import {
  escalateToCityHall,
  findTechDepartmentCityHallConnection,
} from "../lib/tech-department-escalation";
import { TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID } from "../lib/workspace/tech-department";
import {
  requireExternalEntryOfficeId,
  requireTechDepartmentBuildingId,
} from "../lib/workspace/graph-identity-required";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

type Check = { name: string; pass: boolean; details: Record<string, unknown> };

const checks: Check[] = [];

function record(name: string, pass: boolean, details: Record<string, unknown>) {
  checks.push({ name, pass, details });
  console.log(pass ? "PASS" : "FAIL", name);
  console.log(JSON.stringify(details, null, 2));
}

/** Mirrors resolveRoute() step 0 (lib/routing.ts allowedTargetIds fetch). */
async function connectionEligibleTargetIds(sourceEntityId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("connections")
    .select("id, target_entity_id, connection_permissions(send_tasks)")
    .eq("source_entity_id", sourceEntityId)
    .eq("is_active", true);

  return (data ?? [])
    .filter(
      (c: {
        connection_permissions?: { send_tasks?: boolean } | { send_tasks?: boolean }[];
      }) => {
        const perms = c.connection_permissions;
        const row = Array.isArray(perms) ? perms[0] : perms;
        return row?.send_tasks === true;
      },
    )
    .map((c: { target_entity_id: string }) => c.target_entity_id);
}

async function main() {
  const officeId = await requireExternalEntryOfficeId();
  const techBuildingId = await requireTechDepartmentBuildingId(officeId);

  const connection = await findTechDepartmentCityHallConnection();
  if (!connection) {
    console.error(
      "Connection missing — apply supabase/migrations/20260624240000_tech_department_city_hall_connection.sql first",
    );
    process.exit(1);
  }

  record("connection row present", connection.connectionId === TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID, {
    connectionId: connection.connectionId,
    expectedId: TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID,
    sendTasks: connection.sendTasks,
    readResults: connection.readResults,
  });

  const supabase = getSupabaseAdmin();
  const { data: permRow } = await supabase
    .from("connection_permissions")
    .select("read_knowledge, read_rules, read_results, send_tasks")
    .eq("connection_id", connection.connectionId)
    .maybeSingle();

  record(
    "revised Option A permissions (send_tasks=false)",
    permRow?.read_knowledge === false &&
      permRow?.read_rules === false &&
      permRow?.read_results === true &&
      permRow?.send_tasks === false,
    permRow ?? {},
  );

  const escalation = await escalateToCityHall({
    kind: "provider_failure",
    provider: "phase1c-regression",
    error: `probe-${Date.now()}`,
  });

  record("escalation activates (not silent no-op)", escalation != null, {
    escalationId: escalation?.id ?? null,
    connectionId: escalation?.connectionId ?? null,
    delivered: escalation?.delivered ?? null,
    note: "Before seed: escalateToCityHall returned null when connection missing",
  });

  const cityHall = await resolveCityHallBuildingId(AI_COUNCIL_OFFICE_ID);
  const cityHallBuildingId = cityHall.value;
  if (!cityHallBuildingId) {
    throw new Error("City Hall building id not resolved");
  }

  const eligibleFromConnections = await connectionEligibleTargetIds(techBuildingId);

  console.log("\nDIAG connection-derived eligible target ids (resolveRoute step 0 mirror):");
  console.log(JSON.stringify(eligibleFromConnections, null, 2));
  console.log(
    "City Hall in connection-eligible set:",
    eligibleFromConnections.includes(cityHallBuildingId),
  );

  const probeTask =
    "Phase 1C routing probe: describe infrastructure monitoring responsibilities only.";
  const routeDecision = await resolveRoute(probeTask, undefined, techBuildingId);
  const targetIds = routeDecision.targets.map((t) => t.entityRegistryId);
  const cityHallInTargets = targetIds.includes(cityHallBuildingId);

  record(
    "resolveRoute(Tech building source) targets exclude City Hall",
    !cityHallInTargets,
    {
      sourceEntityId: techBuildingId,
      cityHallBuildingId,
      routeMethod: routeDecision.method,
      targetIds,
      cityHallInTargets,
      eligibleFromConnections,
      note: "Explicit assertion on decision.targets only; no routing code modified",
    },
  );

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n=== SUMMARY: ${checks.length - failed.length}/${checks.length} passed ===`);
  if (failed.length > 0) {
    console.log("Failed:", failed.map((f) => f.name).join(", "));
    if (failed.some((f) => f.name.includes("resolveRoute"))) {
      console.log(
        "\nSTOP: City Hall appeared in resolveRoute targets with Tech building source.",
        "Routing fix is out of scope for seed-only Phase 1C — report required.",
      );
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
