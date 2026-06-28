/**
 * W3 verification: full Citizly structure via chamber API (workspace-equivalent).
 * Run: npx tsx scripts/verify_workspace_w3.ts
 */
import { createClient } from "@supabase/supabase-js";

const OFFICE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const BASE = process.env.CONTROL_BASE_URL || "http://localhost:3000";
const RUN_ID = `w3-${Date.now()}`;

const CHAMBERS = ["Instagram", "PDF Processing", "Marketing", "Support"];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  console.log("1. Create Citizly building...");
  const bRes = await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "room",
      label: `Citizly-${RUN_ID}`,
      routing_description:
        "Citizly workspace for content, marketing, product changes, and routing exercises.",
      position_x: 20,
      position_z: 10,
      size_w: 10,
      size_d: 8,
    }),
  });
  const bData = (await bRes.json()) as { object?: { id: string }; error?: string };
  if (!bRes.ok || !bData.object) throw new Error(bData.error ?? "building failed");
  const buildingId = bData.object.id;

  console.log("2. Create chambers inside building...");
  const chamberIds: string[] = [];
  for (let i = 0; i < CHAMBERS.length; i++) {
    const res = await fetch(
      `${BASE}/api/offices/${OFFICE_ID}/buildings/${buildingId}/chambers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: CHAMBERS[i],
          x: -3 + (i % 2) * 6,
          z: -2 + Math.floor(i / 2) * 3,
          width: 2.5,
          depth: 2,
        }),
      },
    );
    const data = (await res.json()) as { chamber?: { id: string; name: string }; error?: string };
    if (!res.ok) throw new Error(data.error ?? `chamber ${CHAMBERS[i]} failed`);
    chamberIds.push(data.chamber!.id);
    console.log("   +", data.chamber!.name);
  }

  console.log("3. Rename chamber...");
  const renameTarget = chamberIds[0];
  const renameRes = await fetch(
    `${BASE}/api/offices/${OFFICE_ID}/buildings/${buildingId}/chambers/${renameTarget}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Instagram Renamed" }),
    },
  );
  if (!renameRes.ok) throw new Error("rename failed");

  console.log("4. Move + resize chamber (local coords)...");
  const patchRes = await fetch(
    `${BASE}/api/offices/${OFFICE_ID}/buildings/${buildingId}/chambers/${chamberIds[1]}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: 1.5, z: 0.5, width: 3, depth: 2.5 }),
    },
  );
  if (!patchRes.ok) throw new Error("geometry patch failed");

  const { data: rows } = await supabase
    .from("chambers")
    .select("name, x, z, width, depth, building_object_id")
    .eq("building_object_id", buildingId)
    .order("name");
  if ((rows?.length ?? 0) !== 4) throw new Error(`expected 4 chambers, got ${rows?.length}`);
  const pdf = rows!.find((r) => r.name === "PDF Processing");
  if (!pdf || Number(pdf.x) !== 1.5) throw new Error("local x not persisted");
  console.log("   chambers in SQL:", rows!.map((r) => r.name).join(", "));

  console.log("5. Delete one chamber...");
  await fetch(
    `${BASE}/api/offices/${OFFICE_ID}/buildings/${buildingId}/chambers/${chamberIds[3]}`,
    { method: "DELETE" },
  );

  const { count } = await supabase
    .from("chambers")
    .select("id", { count: "exact", head: true })
    .eq("building_object_id", buildingId);
  if (count !== 3) throw new Error(`expected 3 after delete, got ${count}`);

  console.log("6. Cleanup...");
  for (const id of chamberIds.slice(0, 3)) {
    await fetch(
      `${BASE}/api/offices/${OFFICE_ID}/buildings/${buildingId}/chambers/${id}`,
      { method: "DELETE" },
    );
  }
  await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects/${buildingId}`, {
    method: "DELETE",
  });

  console.log("\n✅ W3 API verification passed");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
