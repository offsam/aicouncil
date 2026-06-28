/**
 * Quick verification for 2D Control Panel e2e (structure + connections + office_objects sync).
 * Run: npx tsx scripts/verify_control_panel_e2e.ts
 */
import { createClient } from "@supabase/supabase-js";

const OFFICE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const BASE = process.env.CONTROL_BASE_URL || "http://localhost:3000";
const RUN_ID = `ctrl-${Date.now()}`;
const BUILDING_NAME = `Citizly-${RUN_ID}`;
const CHAMBER_IG = `Instagram-${RUN_ID}`;
const CHAMBER_PDF = `PDF Processing-${RUN_ID}`;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  console.log("1. Create building via API...");
  const bRes = await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "room",
      label: BUILDING_NAME,
      routing_description: "Citizly control panel test building for social content and PDF workflow coverage.",
      position_x: 0,
      position_z: 0,
      size_w: 8,
      size_d: 6,
    }),
  });
  const bData = (await bRes.json()) as { object?: { id: string }; error?: string };
  if (!bRes.ok) throw new Error(bData.error ?? "building create failed");
  const buildingId = bData.object!.id;
  console.log("   building id:", buildingId);

  const { data: officeObj } = await supabase
    .from("office_objects")
    .select("id, label, object_type")
    .eq("id", buildingId)
    .single();
  const { data: regBuilding } = await supabase
    .from("entity_registry")
    .select("id, name, entity_type")
    .eq("id", buildingId)
    .single();
  console.log("   SQL office_objects:", officeObj);
  console.log("   SQL entity_registry building:", regBuilding);
  if (!officeObj || !regBuilding) throw new Error("office_objects / entity_registry sync FAILED");

  console.log("2. Create chambers...");
  async function createChamber(name: string, routing?: string) {
    const res = await fetch(
      `${BASE}/api/offices/${OFFICE_ID}/buildings/${buildingId}/chambers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          routing_description: routing,
        }),
      },
    );
    const data = (await res.json()) as { chamber?: { id: string; entity_registry_id: string }; error?: string };
    if (!res.ok) throw new Error(data.error ?? `chamber ${name} failed`);
    return data.chamber!;
  }

  const ig = await createChamber(
    CHAMBER_IG,
    `Handles Instagram marketing and social content for ${BUILDING_NAME}`,
  );
  const pdf = await createChamber(
    CHAMBER_PDF,
    `Processes PDF documents for ${BUILDING_NAME}`,
  );
  console.log("   chambers:", ig.id, pdf.id);

  console.log("3. Assign agent to Instagram chamber...");
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("office_id", OFFICE_ID)
    .limit(1);
  const agentId = agents?.[0]?.id;
  if (!agentId) throw new Error("No agent in city");
  const aRes = await fetch(`${BASE}/api/chambers/${ig.id}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId }),
  });
  if (!aRes.ok) throw new Error("assignment failed");

  console.log("4. Create connection Instagram → PDF with read_knowledge...");
  const cRes = await fetch(`${BASE}/api/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_entity_id: ig.entity_registry_id,
      target_entity_id: pdf.entity_registry_id,
      read_knowledge: true,
    }),
  });
  const cData = (await cRes.json()) as { connection?: { id: string }; error?: string };
  if (!cRes.ok) throw new Error(cData.error ?? "connection failed");
  console.log("   connection id:", cData.connection?.id);

  console.log("5. Chat routing test for Instagram task...");
  const chatRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: `Напиши пост для Instagram про ${BUILDING_NAME} — короткий анонс`,
    }),
  });
  const chatData = (await chatRes.json()) as {
    mode?: string;
    routing?: { targets?: Array<{ entityRegistryId: string; reason?: string }> };
    targetName?: string;
    error?: string;
  };
  if (!chatRes.ok) throw new Error(chatData.error ?? "chat failed");
  const targetId = chatData.routing?.targets?.[0]?.entityRegistryId;
  console.log("   mode:", chatData.mode, "target:", chatData.targetName, targetId);
  console.log("   routed to IG chamber?", targetId === ig.entity_registry_id);

  console.log("\n✅ Control panel e2e verification complete");
  console.log(`   Building: ${BUILDING_NAME} (${buildingId})`);
  console.log(`   Test run id: ${RUN_ID}`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
