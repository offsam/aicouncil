/**
 * W2 verification: Building CRUD via existing APIs.
 * Run: npx tsx scripts/verify_workspace_w2.ts
 */
import { createClient } from "@supabase/supabase-js";

const OFFICE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const BASE = process.env.CONTROL_BASE_URL || "http://localhost:3000";
const RUN_ID = `w2-${Date.now()}`;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  console.log("1. Create building...");
  const createRes = await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "room",
      label: `W2-Test-${RUN_ID}`,
      routing_description:
        "W2 verification building for workspace CRUD and registry synchronization tests.",
      position_x: 42,
      position_z: -18,
      size_w: 8,
      size_d: 6,
    }),
  });
  const created = (await createRes.json()) as { object?: { id: string }; error?: string };
  if (!createRes.ok || !created.object) throw new Error(created.error ?? "create failed");
  const buildingId = created.object.id;

  const { data: reg } = await supabase
    .from("entity_registry")
    .select("id, name, entity_type")
    .eq("id", buildingId)
    .single();
  const { data: obj } = await supabase
    .from("office_objects")
    .select("id, label, position_x, position_z")
    .eq("id", buildingId)
    .single();
  if (!reg || reg.entity_type !== "building") throw new Error("entity_registry missing");
  if (!obj) throw new Error("office_objects missing");
  console.log("   ok:", buildingId, reg.name);

  console.log("2. Rename building...");
  const renameRes = await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects/${buildingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: `W2-Renamed-${RUN_ID}` }),
  });
  if (!renameRes.ok) throw new Error("rename failed");
  const { data: renamed } = await supabase
    .from("entity_registry")
    .select("name")
    .eq("id", buildingId)
    .single();
  if (renamed?.name !== `W2-Renamed-${RUN_ID}`) throw new Error("registry name not synced");
  console.log("   ok:", renamed.name);

  console.log("3. Add chamber — delete should be blocked in UI (API would cascade)...");
  const chRes = await fetch(
    `${BASE}/api/offices/${OFFICE_ID}/buildings/${buildingId}/chambers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `W2-Chamber-${RUN_ID}` }),
    },
  );
  const chData = (await chRes.json()) as {
    chamber?: { id: string; entity_registry_id: string };
    error?: string;
  };
  if (!chRes.ok) throw new Error(chData.error ?? "chamber create failed");
  const chamberId = chData.chamber!.id;

  const { count } = await supabase
    .from("chambers")
    .select("id", { count: "exact", head: true })
    .eq("building_object_id", buildingId);
  if ((count ?? 0) < 1) throw new Error("chamber count expected >= 1");
  console.log("   chamber count:", count);

  console.log("4. Drag persist simulation (PATCH position)...");
  const dragRes = await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects/${buildingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position_x: 55, position_z: -22 }),
  });
  if (!dragRes.ok) throw new Error("drag patch failed");
  const { data: moved } = await supabase
    .from("office_objects")
    .select("position_x, position_z")
    .eq("id", buildingId)
    .single();
  if (moved?.position_x !== 55 || moved?.position_z !== -22) throw new Error("position not saved");
  console.log("   ok:", moved);

  console.log("5. Delete chamber then empty building...");
  const delCh = await fetch(
    `${BASE}/api/offices/${OFFICE_ID}/buildings/${buildingId}/chambers/${chamberId}`,
    { method: "DELETE" },
  );
  if (!delCh.ok) throw new Error("chamber delete failed");

  const delRes = await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects/${buildingId}`, {
    method: "DELETE",
  });
  if (!delRes.ok) throw new Error("delete building failed");
  const { data: gone } = await supabase
    .from("office_objects")
    .select("id")
    .eq("id", buildingId)
    .maybeSingle();
  if (gone) throw new Error("building still in DB");
  console.log("   deleted ok");

  console.log("\n✅ W2 API verification passed");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
