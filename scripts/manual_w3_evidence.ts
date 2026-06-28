/**
 * W3 manual evidence seed + SQL snapshot.
 * Run: npx tsx scripts/manual_w3_evidence.ts
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const OFFICE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const BASE = process.env.CONTROL_BASE_URL || "http://localhost:3000";

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  // Remove prior manual Citizly buildings to avoid clutter
  const { data: oldRooms } = await supabase
    .from("office_objects")
    .select("id")
    .eq("office_id", OFFICE_ID)
    .eq("object_type", "room")
    .eq("label", "Citizly");
  for (const r of oldRooms ?? []) {
    const { data: chs } = await supabase
      .from("chambers")
      .select("id")
      .eq("building_object_id", r.id);
    for (const c of chs ?? []) {
      await fetch(`${BASE}/api/offices/${OFFICE_ID}/buildings/${r.id}/chambers/${c.id}`, {
        method: "DELETE",
      });
    }
    await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects/${r.id}`, { method: "DELETE" });
  }

  const bRes = await fetch(`${BASE}/api/offices/${OFFICE_ID}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "room",
      label: "Citizly",
      routing_description:
        "Citizly product workspace for content, marketing, product fixes, and project coordination.",
      position_x: 24,
      position_z: 12,
      size_w: 10,
      size_d: 8,
    }),
  });
  const bData = (await bRes.json()) as { object?: { id: string }; error?: string };
  if (!bRes.ok || !bData.object) throw new Error(bData.error ?? "building");
  const buildingId = bData.object.id;

  const names = ["Instagram", "PDF Processing", "Marketing", "Support"];
  for (let i = 0; i < names.length; i++) {
    const res = await fetch(
      `${BASE}/api/offices/${OFFICE_ID}/buildings/${buildingId}/chambers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: names[i],
          x: -3 + (i % 2) * 6,
          z: -2 + Math.floor(i / 2) * 3,
          width: 2.5,
          depth: 2,
        }),
      },
    );
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      throw new Error(d.error ?? names[i]);
    }
  }

  const { data: building } = await supabase
    .from("office_objects")
    .select("id, label, position_x, position_z, size_w, size_d")
    .eq("id", buildingId)
    .single();

  const { data: rows } = await supabase
    .from("chambers")
    .select("id, name, x, z, width, depth")
    .eq("building_object_id", buildingId)
    .order("name");

  console.log(JSON.stringify({ buildingId, building, chambers: rows }, null, 2));
}

run().catch((e) => {
  console.error(e);
  exitEvidence(1);
});
