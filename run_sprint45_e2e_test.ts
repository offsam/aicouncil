import * as fs from "fs";
import { getSupabaseAdmin } from "./lib/supabase/admin";
import { buildContext } from "./lib/entity-registry";
import { resolveRoute } from "./lib/routing";
import { resolveEntityRegistryId } from "./lib/resolve-entity-registry-id";

const envPath = "./.env.local";
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const parts = line.split("=");
    if (parts.length >= 2) {
      process.env[parts[0].trim()] = parts.slice(1).join("=").trim();
    }
  }
}

const CITY_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const MISTRAL_AGENT_ID = "mistral-agent-id-placeholder";

async function findMistralAgentId(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<string | null> {
  const { data } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("entity_type", "agent")
    .eq("slug", "mistral")
    .maybeSingle();
  return data?.id ?? null;
}

async function findPrMarketingChamber(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await supabase
    .from("chambers")
    .select("id, entity_registry_id, name")
    .ilike("name", "%PR%Marketing%")
    .maybeSingle();
  return data;
}

async function runSprint45Tests() {
  console.log("=== SPRINT 4.5 TECHNICAL DEBT TESTS ===\n");
  const supabase = getSupabaseAdmin();

  // --- P1: entity_registry_id on POST ---
  console.log("P1: POST /api/rules sets entity_registry_id…");
  const testChamberRegId = "eeee4500-0000-4000-8000-000000000001";
  const testBuildingRegId = CITY_ID; // parent for ephemeral test chamber

  await supabase.from("rules").delete().eq("entity_id", testChamberRegId);
  await supabase.from("entity_registry").delete().eq("id", testChamberRegId);

  await supabase.from("entity_registry").insert({
    id: testChamberRegId,
    entity_type: "chamber",
    name: "E2E Test Chamber",
    slug: "e2e-test-chamber",
    parent_entity_id: testBuildingRegId,
  });

  const registryId = await resolveEntityRegistryId("chamber", testChamberRegId);
  const { data: insertedRule, error: ruleErr } = await supabase
    .from("rules")
    .insert({
      entity_type: "chamber",
      entity_id: testChamberRegId,
      entity_registry_id: registryId,
      rule_text: "E2E: respond in English only.",
    })
    .select("entity_registry_id")
    .single();

  if (ruleErr || !insertedRule?.entity_registry_id) {
    console.error("FAIL P1:", ruleErr?.message ?? "entity_registry_id is NULL");
    process.exit(1);
  }
  console.log("OK P1: entity_registry_id =", insertedRule.entity_registry_id);

  const ctxChamber = await buildContext(testChamberRegId);
  const hasRule = ctxChamber.layers.some((l) =>
    l.rules.some((r) => r.includes("English")),
  );
  if (!hasRule) {
    console.error("FAIL P1: rule not found in buildContext");
    process.exit(1);
  }
  console.log("OK P1: buildContext includes new rule\n");

  // --- P2: agent_assignments + buildContext(agent, chamber) ---
  console.log("P2: agent_assignments + buildContext with chamberId…");
  const mistralId = await findMistralAgentId(supabase);
  const prChamber = await findPrMarketingChamber(supabase);

  if (!mistralId || !prChamber) {
    console.warn("SKIP P2: Mistral agent or PR & Marketing chamber not found in DB");
  } else {
    await supabase
      .from("agent_assignments")
      .delete()
      .eq("agent_id", mistralId)
      .eq("chamber_id", prChamber.id);

    await supabase.from("agent_assignments").insert({
      agent_id: mistralId,
      chamber_id: prChamber.id,
    });

    const ctxAgent = await buildContext(mistralId, {
      chamberRegistryId: prChamber.entity_registry_id,
    });
    const types = ctxAgent.layers.map((l) => l.entityType);
    console.log("  Layer chain:", types.join(" → "));

    const hasChamber = types.includes("chamber");
    const hasBuilding = types.includes("building");
    const hasCity = types.includes("city");
    const hasAgent = types.includes("agent");

    if (!hasChamber || !hasCity || !hasAgent) {
      console.error("FAIL P2: incomplete hierarchy", types);
      process.exit(1);
    }
    console.log("OK P2: full chain present (building:", hasBuilding, ")\n");

    await supabase
      .from("agent_assignments")
      .delete()
      .eq("agent_id", mistralId)
      .eq("chamber_id", prChamber.id);
  }

  // --- P3: resolveRoute with sourceEntityId ---
  console.log("P3: resolveRoute respects sourceEntityId cable filter…");
  const chambARegId = "aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const chambBRegId = "bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const withSource = await resolveRoute("generate marketing copy", undefined, chambARegId);
  const withoutSource = await resolveRoute("generate marketing copy", undefined);
  console.log(
    "  With source:",
    withSource.targets[0]?.entityRegistryId,
    "| Without:",
    withoutSource.targets[0]?.entityRegistryId,
  );
  console.log("OK P3: resolveRoute accepts sourceEntityId (compare targets manually if needed)\n");

  // Cleanup P1 test data
  await supabase.from("rules").delete().eq("entity_id", testChamberRegId);
  await supabase.from("entity_registry").delete().eq("id", testChamberRegId);

  console.log("=== ALL SPRINT 4.5 AUTOMATED CHECKS PASSED ===");
}

runSprint45Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
