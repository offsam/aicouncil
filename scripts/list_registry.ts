import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

async function run() {
  const envContent = fs.readFileSync(".env.local", "utf8");
  for (const line of envContent.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  // Fetch from entity_registry
  const { data: reg, error: regErr } = await supabase.from("entity_registry").select("id, name, entity_type, slug");
  if (regErr) {
    console.error(regErr);
    return;
  }
  const regMap = new Map(reg.map(r => [r.id, r]));

  // Fetch buildings
  const { data: bld, error: bldErr } = await supabase.from("buildings").select("id, name, flow_x, flow_y");
  if (bldErr) console.error(bldErr);
  const bldMap = new Map(bld?.map(b => [b.id, b]) ?? []);

  // Fetch chambers
  const { data: chm, error: chmErr } = await supabase.from("chambers").select("id, name, building_id, flow_x, flow_y");
  if (chmErr) console.error(chmErr);
  const chmMap = new Map(chm?.map(c => [c.id, c]) ?? []);

  // Fetch agents
  const { data: ag, error: agErr } = await supabase.from("agents").select("id, name");
  if (agErr) console.error(agErr);
  const agMap = new Map(ag?.map(a => [a.id, a]) ?? []);

  console.log("=== REGISTRY ===");
  reg.forEach(r => {
    console.log(`${r.id}: [${r.entity_type}] ${r.name} (${r.slug})`);
  });

  console.log("\n=== BUILDINGS ===");
  bld?.forEach(b => {
    console.log(`${b.id}: ${b.name} @ (${b.flow_x}, ${b.flow_y})`);
  });

  console.log("\n=== CHAMBERS ===");
  chm?.forEach(c => {
    console.log(`${c.id}: ${c.name} in building ${c.building_id} @ (${c.flow_x}, ${c.flow_y})`);
  });
}

run().catch(console.error);
