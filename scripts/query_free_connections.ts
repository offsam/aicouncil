import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function main() {
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const office = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
  const cityHall = "aa5c2d68-cf23-4290-b9fa-3f83446c1a4f";

  const { data: ch } = await s
    .from("chambers")
    .select("name, entity_registry_id, building_object_id")
    .eq("office_id", office)
    .or("name.ilike.%free%,name.ilike.%Сi%,name.ilike.%Si%");

  console.log("chambers:", ch);

  const { data: cityChambers } = await s
    .from("chambers")
    .select("name, entity_registry_id, building_object_id")
    .eq("office_id", office)
    .eq("building_object_id", cityHall);

  console.log("\ncity hall chambers (by building_object_id):", cityChambers?.length ?? 0);
  for (const c of cityChambers ?? []) console.log(`  ${c.name} ${c.entity_registry_id}`);

  const ids = new Set([
    cityHall,
    ...(ch ?? []).map((c) => c.entity_registry_id),
    ...(cityChambers ?? []).map((c) => c.entity_registry_id),
  ]);

  const { data: conns } = await s
    .from("connections")
    .select(
      "id, source_entity_id, target_entity_id, is_active, created_at, source:entity_registry!connections_source_entity_id_fkey(name), target:entity_registry!connections_target_entity_id_fkey(name)",
    )
    .eq("is_active", true);

  const related = (conns ?? []).filter(
    (c) => ids.has(c.source_entity_id) || ids.has(c.target_entity_id),
  );
  console.log("\nactive connections touching city hall / free / main:");
  for (const c of related) {
    console.log(
      `  ${c.id.slice(0, 8)} ${c.source?.name ?? c.source_entity_id} -> ${c.target?.name ?? c.target_entity_id}`,
    );
  }

  const { data: inactive } = await s
    .from("connections")
    .select(
      "id, source_entity_id, target_entity_id, is_active, source:entity_registry!connections_source_entity_id_fkey(name), target:entity_registry!connections_target_entity_id_fkey(name)",
    )
    .eq("is_active", false)
    .or(
      [...ids]
        .flatMap((id) => [`source_entity_id.eq.${id}`, `target_entity_id.eq.${id}`])
        .join(","),
    );

  console.log("\nrecently deactivated (ghost) connections:", inactive?.length ?? 0);
  for (const c of (inactive ?? []).slice(0, 15)) {
    console.log(
      `  ${c.id.slice(0, 8)} ${c.source?.name ?? c.source_entity_id} -> ${c.target?.name ?? c.target_entity_id}`,
    );
  }
}

main().catch(console.error);
