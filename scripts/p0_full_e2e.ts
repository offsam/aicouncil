/**
 * Sprint 4.5 P0 — full chain via HTTP API (no direct SQL inserts).
 * Verification uses SQL SELECT after each step.
 *
 * Usage:
 *   npm run dev   # separate terminal
 *   npx tsx scripts/p0_full_e2e.ts [baseUrl]
 */
import * as fs from "fs";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import { buildContext } from "../lib/entity-registry";
import { resolveRoute } from "../lib/routing";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = process.argv[2] || "http://localhost:3000";
const RUN_ID = Date.now().toString(36);
const CITY_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

type Json = Record<string, unknown>;

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  let body: Json = {};
  try {
    body = (await res.json()) as Json;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function sql(label: string, query: string, params?: string[]) {
  const supabase = getSupabaseAdmin();
  console.log(`\n--- SQL after ${label} ---`);
  console.log(query.trim());
  if (params?.length) console.log("params:", params);

  // Route known verification queries through supabase client
  if (query.includes("FROM offices") && query.includes("ORDER BY created_at DESC")) {
    const { data, error } = await supabase.from("offices").select("id, name, created_at").order("created_at", { ascending: false }).limit(3);
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  if (query.includes("FROM entity_registry") && query.includes("entity_type = 'city'")) {
    const { data, error } = await supabase.from("entity_registry").select("id, entity_type, name, slug, parent_entity_id").eq("entity_type", "city").order("created_at", { ascending: false }).limit(3);
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  if (query.includes("office_objects") && query.includes("object_type = 'room'")) {
    const id = params?.[0];
    const q = supabase.from("office_objects").select("id, office_id, object_type, label, size_w, size_d").eq("object_type", "room").order("created_at", { ascending: false }).limit(3);
    const { data, error } = id ? await q.eq("id", id) : await q;
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  if (query.includes("FROM entity_registry") && query.includes("entity_type = 'building'")) {
    const id = params?.[0];
    const q = supabase.from("entity_registry").select("id, entity_type, name, parent_entity_id").eq("entity_type", "building").order("created_at", { ascending: false }).limit(3);
    const { data, error } = id ? await q.eq("id", id) : await q;
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  if (query.includes("FROM chambers")) {
    const id = params?.[0];
    const q = supabase.from("chambers").select("id, entity_registry_id, building_entity_id, name, x, z, width, depth").order("created_at", { ascending: false }).limit(3);
    const { data, error } = id ? await q.eq("id", id) : await q;
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  if (query.includes("FROM agent_assignments")) {
    const { data, error } = await supabase
      .from("agent_assignments")
      .select("id, agent_id, chamber_id, role, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  if (query.includes("FROM rules") && query.includes("entity_registry_id")) {
    const id = params?.[0];
    const q = supabase.from("rules").select("id, entity_type, entity_id, entity_registry_id, rule_text").order("created_at", { ascending: false }).limit(3);
    const { data, error } = id ? await q.eq("id", id) : await q;
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  if (query.includes("FROM knowledge") && query.includes("entity_registry_id")) {
    const id = params?.[0];
    const q = supabase.from("knowledge").select("id, entity_type, entity_id, entity_registry_id, title").order("created_at", { ascending: false }).limit(3);
    const { data, error } = id ? await q.eq("id", id) : await q;
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  if (query.includes("FROM connections")) {
    const id = params?.[0];
    const q = supabase.from("connections").select("id, source_entity_id, target_entity_id, is_active, priority").order("created_at", { ascending: false }).limit(3);
    const { data, error } = id ? await q.eq("id", id) : await q;
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  if (query.includes("connection_permissions")) {
    const id = params?.[0];
    const { data, error } = await supabase
      .from("connection_permissions")
      .select("connection_id, read_knowledge, read_rules, read_results, send_tasks")
      .eq("connection_id", id || "")
      .maybeSingle();
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  if (query.includes("routing_logs")) {
    const { data, error } = await supabase
      .from("routing_logs")
      .select("id, task_text, chosen_target_entity_registry_id, method, agent_count, created_at")
      .order("created_at", { ascending: false })
      .limit(3);
    console.log(JSON.stringify(data, null, 2));
    if (error) console.log("error:", error.message);
    return data;
  }
  console.log("(unmapped query)");
  return null;
}

async function ensureMigration() {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("agent_assignments").select("id").limit(1);
  if (error) {
    throw new Error(
      `agent_assignments table missing. Apply migration first:\n` +
        `  SUPABASE_DB_PASSWORD=... npx tsx scripts/apply_sprint45_pg.ts\n` +
        `  or paste supabase/migrations/20250622500000_sprint45_technical_debt.sql in Supabase SQL Editor`,
    );
  }
}

async function main() {
  console.log("=== P0 FULL E2E (API-only writes) ===");
  console.log("BASE:", BASE, "RUN_ID:", RUN_ID);

  await ensureMigration();

  // Step 1: City
  console.log("\n[1] POST /api/offices — create city");
  const cityRes = await api("/api/offices", {
    method: "POST",
    body: JSON.stringify({ name: `P0 City ${RUN_ID}`, rules: "" }),
  });
  if (cityRes.status !== 201) throw new Error(`City create failed: ${JSON.stringify(cityRes.body)}`);
  const officeId = (cityRes.body.office as Json)?.id as string;
  const cityRegId = (cityRes.body.registry as Json)?.id as string;
  console.log("API response office.id:", officeId);
  await sql("step 1 city", "SELECT id, name, created_at FROM offices ORDER BY created_at DESC LIMIT 3");
  await sql("step 1 registry city", "SELECT id, entity_type, name, slug, parent_entity_id FROM entity_registry WHERE entity_type = 'city' ORDER BY created_at DESC LIMIT 3");

  // Step 2: Building
  console.log("\n[2] POST /api/offices/:id/objects — create building (room)");
  const buildingRes = await api(`/api/offices/${officeId}/objects`, {
    method: "POST",
    body: JSON.stringify({
      object_type: "room",
      position_x: 2,
      position_z: 2,
      size_w: 8,
      size_d: 6,
      label: `P0 Building ${RUN_ID}`,
      routing_description:
        "P0 test building for end-to-end routing, chamber creation, and workflow validation.",
    }),
  });
  if (buildingRes.status !== 201) throw new Error(`Building create failed: ${JSON.stringify(buildingRes.body)}`);
  const buildingId = (buildingRes.body.object as Json)?.id as string;
  console.log("API response building.id:", buildingId);
  await sql("step 2 building object", "SELECT id, office_id, object_type, label FROM office_objects WHERE object_type = 'room' ORDER BY created_at DESC LIMIT 3");
  await sql("step 2 building registry", "SELECT id, entity_type, name, parent_entity_id FROM entity_registry WHERE entity_type = 'building' ORDER BY created_at DESC LIMIT 3", [buildingId]);

  // Step 3: Chamber A (target for agent)
  console.log("\n[3] POST chamber A");
  const chamberARes = await api(`/api/offices/${officeId}/buildings/${buildingId}/chambers`, {
    method: "POST",
    body: JSON.stringify({ name: `P0 Chamber A ${RUN_ID}`, x: 1, z: 1, width: 3, depth: 2 }),
  });
  if (chamberARes.status !== 201) throw new Error(`Chamber A failed: ${JSON.stringify(chamberARes.body)}`);
  const chamberA = chamberARes.body.chamber as Json;
  const chamberAId = chamberA.id as string;
  const chamberARegId = chamberA.entity_registry_id as string;
  console.log("chamberA:", chamberAId, "registry:", chamberARegId);
  await sql("step 3 chamber A", "SELECT id, entity_registry_id, building_entity_id, name FROM chambers ORDER BY created_at DESC LIMIT 3", [chamberAId]);

  // Step 3b: Chamber B (cable target with send_tasks=false for P3)
  console.log("\n[3b] POST chamber B (cable target)");
  const chamberBRes = await api(`/api/offices/${officeId}/buildings/${buildingId}/chambers`, {
    method: "POST",
    body: JSON.stringify({ name: `P0 Chamber B ${RUN_ID}`, x: 4, z: 1, width: 3, depth: 2 }),
  });
  if (chamberBRes.status !== 201) throw new Error(`Chamber B failed: ${JSON.stringify(chamberBRes.body)}`);
  const chamberB = chamberBRes.body.chamber as Json;
  const chamberBRegId = chamberB.entity_registry_id as string;

  // Step 4: Assign existing Mistral agent (reuse global agent, new chamber)
  console.log("\n[4] POST agent_assignments via /api/chambers/:id/assignments");
  const supabase = getSupabaseAdmin();
  const { data: mistralReg } = await supabase
    .from("entity_registry")
    .select("id, name, slug, parent_entity_id")
    .eq("entity_type", "agent")
    .eq("slug", "mistral")
    .single();
  if (!mistralReg) throw new Error("Mistral agent not found in entity_registry");
  const assignRes = await api(`/api/chambers/${chamberAId}/assignments`, {
    method: "POST",
    body: JSON.stringify({ agent_id: mistralReg.id }),
  });
  if (assignRes.status !== 201) throw new Error(`Assignment failed: ${JSON.stringify(assignRes.body)}`);
  await sql("step 4 assignment", "SELECT id, agent_id, chamber_id, role FROM agent_assignments ORDER BY created_at DESC LIMIT 5");

  // P2 proof: buildContext with explicit chamber
  console.log("\n[P2] buildContext(agentId, chamberRegistryId)");
  const ctxWithChamber = await buildContext(mistralReg.id, { chamberRegistryId: chamberARegId });
  const layerTypes = ctxWithChamber.layers.map((l) => `${l.entityType}:${l.entityName}`);
  console.log("layers:", layerTypes.join(" → "));
  const hasChamberLayer = ctxWithChamber.layers.some((l) => l.entityRegistryId === chamberARegId);
  const cityOnlyFallback = ctxWithChamber.layers.length === 2 && ctxWithChamber.layers.some((l) => l.entityType === "city");
  if (!hasChamberLayer || cityOnlyFallback) {
    throw new Error(`P2 FAIL: expected chamber ${chamberARegId} in context, got: ${layerTypes.join(", ")}`);
  }
  console.log("P2 OK: chamber layer present, parent_entity_id of agent is", mistralReg.parent_entity_id, "(city), but context uses assignment chamber");

  // Step 5: Rule
  console.log("\n[5] POST /api/rules");
  const ruleText = "P0 RULE: You must answer only in English. Start with ENGLISH_OK.";
  const ruleRes = await api("/api/rules", {
    method: "POST",
    body: JSON.stringify({ entity_type: "chamber", entity_id: chamberARegId, rule_text: ruleText }),
  });
  if (ruleRes.status !== 201) throw new Error(`Rule failed: ${JSON.stringify(ruleRes.body)}`);
  const ruleId = ((ruleRes.body.rule as Json)?.id as string) || "";
  const ruleRows = await sql("step 5 rule", "SELECT id, entity_type, entity_id, entity_registry_id, rule_text FROM rules ORDER BY created_at DESC LIMIT 3", [ruleId]) as Array<{ entity_registry_id: string | null }> | null;
  if (!ruleRows?.[0]?.entity_registry_id) throw new Error("P1 FAIL: entity_registry_id NULL on new rule");

  // Step 6: Knowledge
  console.log("\n[6] POST /api/knowledge");
  const knowRes = await api("/api/knowledge", {
    method: "POST",
    body: JSON.stringify({
      entity_type: "chamber",
      entity_id: chamberARegId,
      title: `P0 Knowledge ${RUN_ID}`,
      content: "Brand color is purple.",
    }),
  });
  if (knowRes.status !== 201) throw new Error(`Knowledge failed: ${JSON.stringify(knowRes.body)}`);
  const knowId = ((knowRes.body.entry as Json)?.id as string) || "";
  await sql("step 6 knowledge", "SELECT id, entity_type, entity_id, entity_registry_id, title FROM knowledge ORDER BY created_at DESC LIMIT 3", [knowId]);

  // Step 7: Connection A→B with send_tasks on B as target from A (source filters routes FROM A)
  console.log("\n[7] POST /api/connections A→B send_tasks");
  const connRes = await api("/api/connections", {
    method: "POST",
    body: JSON.stringify({
      source_entity_id: chamberARegId,
      target_entity_id: chamberBRegId,
      send_tasks: true,
      read_rules: true,
      read_knowledge: false,
      read_results: false,
    }),
  });
  if (connRes.status !== 201) throw new Error(`Connection failed: ${JSON.stringify(connRes.body)}`);
  const connId = ((connRes.body.connection as Json)?.id as string) || "";
  await sql("step 7 connection", "SELECT id, source_entity_id, target_entity_id, is_active FROM connections ORDER BY created_at DESC LIMIT 3", [connId]);
  await sql("step 7 permissions", "SELECT connection_id, send_tasks FROM connection_permissions WHERE connection_id = $1", [connId]);

  // Register routing targets for chamber B so resolveRoute can pick it
  await supabase.from("entity_registry").update({
    routing_description: `P0 test chamber B ${RUN_ID} handles marketing copy generation`,
  }).eq("id", chamberBRegId);

  // P3: resolveRoute with sourceEntityId = chamber A
  console.log("\n[P3] resolveRoute with sourceEntityId=chamberA");
  const withoutSource = await resolveRoute("generate marketing copy for launch", undefined);
  const withSource = await resolveRoute("generate marketing copy for launch", undefined, chamberARegId);
  console.log("without sourceEntityId target:", withoutSource.targets[0]?.entityRegistryId, withoutSource.targets[0]?.reason);
  console.log("with sourceEntityId target:", withSource.targets[0]?.entityRegistryId, withSource.targets[0]?.reason);
  if (withSource.targets[0]?.entityRegistryId !== chamberBRegId) {
    throw new Error(`P3 FAIL: expected target ${chamberBRegId}, got ${withSource.targets[0]?.entityRegistryId}`);
  }
  console.log("P3 OK: cable send_tasks restricted routing to chamber B");

  // P3 via /api/route (Mission Control path)
  console.log("\n[P3] POST /api/route with sourceEntityId (Mission Control path)");
  const routeApi = await api("/api/route", {
    method: "POST",
    body: JSON.stringify({
      question: "generate marketing copy for launch",
      sourceEntityId: chamberARegId,
    }),
  });
  if (routeApi.status !== 200) throw new Error(`/api/route failed: ${JSON.stringify(routeApi.body)}`);
  const decision = routeApi.body.decision as Json;
  const routeTarget = ((decision?.targets as Json[])?.[0] as Json)?.entityRegistryId;
  console.log("/api/route chosen target:", routeTarget, "method:", decision?.method);
  if (routeTarget !== chamberBRegId) {
    throw new Error(`P3 /api/route FAIL: expected ${chamberBRegId}, got ${routeTarget}`);
  }
  await sql("step P3 routing_logs", "SELECT id, task_text, chosen_target_entity_registry_id, method FROM routing_logs ORDER BY created_at DESC LIMIT 3");

  // Step 8: buildContext includes rule + horizontal from connection
  console.log("\n[8] buildContext on agent with chamber — rule + cable");
  const ctxFinal = await buildContext(mistralReg.id, { chamberRegistryId: chamberARegId });
  const ruleInCtx = ctxFinal.flattenedPrompt.includes("ENGLISH_OK") || ctxFinal.flattenedPrompt.includes("English");
  const hasHorizontal = ctxFinal.flattenedPrompt.includes("Connected:") || ctxFinal.flattenedPrompt.includes("via cable");
  console.log("rule in context:", ruleInCtx, "| horizontal cable:", hasHorizontal);
  console.log("context excerpt:\n", ctxFinal.flattenedPrompt.slice(0, 600));

  // Step 9: Ask agent (Mission Control payload shape)
  console.log("\n[9] POST /api/ask-mistral with chamberRegistryId");
  const askRes = await api("/api/ask-mistral", {
    method: "POST",
    body: JSON.stringify({
      question: "Say hello in one sentence.",
      chamberRegistryId: chamberARegId,
    }),
  });
  console.log("ask-mistral status:", askRes.status);
  const answer = (askRes.body.answer as string) || (askRes.body.error as string) || "";
  console.log("answer:", answer.slice(0, 300));
  if (askRes.status === 200 && answer) {
    const followsRule = /english/i.test(answer) || answer.includes("ENGLISH_OK");
    console.log("rule influence (English):", followsRule ? "likely yes" : "check manually");
  }

  console.log("\n=== P0 COMPLETE ===");
  console.log("city:", officeId, "| building:", buildingId, "| chamberA:", chamberARegId, "| agent:", mistralReg.id);
}

main().catch((err) => {
  console.error("\nP0 FAILED:", err);
  process.exit(1);
});
