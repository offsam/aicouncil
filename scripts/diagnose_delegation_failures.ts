/**
 * Diagnose Finding A (Кактусовая Лавка) and Finding B (lawyers main chamber).
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function q(label: string, fn: () => Promise<unknown>) {
  console.log(`\n=== ${label} ===`);
  const r = await fn();
  console.log(JSON.stringify(r, null, 2));
}

async function main() {
  await q("entity_registry ILIKE кактус/лавка/t_", async () => {
    const { data, error } = await supabase
      .from("entity_registry")
      .select("id, entity_type, name, slug, parent_entity_id, building_role, routing_description")
      .or(
        "name.ilike.%кактус%,name.ilike.%лавка%,name.ilike.%t_Кактусовая%,slug.ilike.%кактус%,slug.ilike.%лавка%",
      );
    return { error: error?.message, count: data?.length, rows: data };
  });

  await q("office_objects ILIKE кактус/лавка/t_", async () => {
    const { data, error } = await supabase
      .from("office_objects")
      .select("id, office_id, object_type, label, position_x, position_z, size_w, size_d, created_at")
      .or("label.ilike.%кактус%,label.ilike.%лавка%,label.ilike.%t_Кактусовая%");
    return { error: error?.message, count: data?.length, rows: data };
  });

  await q("exact id from cleanup list f83e317c", async () => {
    const id = "f83e317c-d4f3-44f3-a47e-88fa76135453";
    const [reg, obj] = await Promise.all([
      supabase.from("entity_registry").select("*").eq("id", id).maybeSingle(),
      supabase.from("office_objects").select("*").eq("id", id).maybeSingle(),
    ]);
    return {
      entity_registry: reg.data,
      office_objects: obj.data,
      regErr: reg.error?.message,
      objErr: obj.error?.message,
    };
  });

  await q("routing_logs for cactus photo question", async () => {
    const { data, error } = await supabase
      .from("routing_logs")
      .select(
        "id, task_text, chosen_target_entity_registry_id, method, routing_action, routing_matched_by, routing_reasoning, routing_trace, agent_count, created_at",
      )
      .ilike("task_text", "%фотограф%")
      .order("created_at", { ascending: false })
      .limit(5);
    return { error: error?.message, rows: data };
  });

  await q("LAWYERS building 99a8efff chambers routing_role", async () => {
    const buildingId = "99a8efff-d39d-4130-8553-7dada4c07b1a";
    const [bReg, bObj, chambers, childChambers] = await Promise.all([
      supabase
        .from("entity_registry")
        .select("id, name, slug, parent_entity_id, building_role")
        .eq("id", buildingId)
        .maybeSingle(),
      supabase
        .from("office_objects")
        .select("id, office_id, label, object_type")
        .eq("id", buildingId)
        .maybeSingle(),
      supabase
        .from("chambers")
        .select(
          "id, name, entity_registry_id, building_entity_id, building_object_id, routing_role, manager_agent_id",
        )
        .or(`building_entity_id.eq.${buildingId},building_object_id.eq.${buildingId}`),
      supabase
        .from("entity_registry")
        .select("id, name, slug, parent_entity_id")
        .eq("entity_type", "chamber")
        .eq("parent_entity_id", buildingId),
    ]);
    return {
      entity_registry: bReg.data,
      office_objects: bObj.data,
      chambers_table: chambers.data,
      chambers_err: chambers.error?.message,
      entity_registry_children: childChambers.data,
    };
  });

  await q("external entry office buildings (canvas-visible set)", async () => {
    const { data: offices } = await supabase.from("offices").select("id, name, workspace_meta");
    const flagged = (offices ?? []).filter(
      (o) => (o.workspace_meta as Record<string, unknown>)?.external_entry === true,
    );
    const officeId = flagged[0]?.id;
    const { data: objects } = await supabase
      .from("office_objects")
      .select("id, label, object_type, office_id")
      .eq("office_id", officeId)
      .eq("object_type", "room");
    const { data: buildings } = await supabase
      .from("entity_registry")
      .select("id, name, entity_type, parent_entity_id, building_role")
      .eq("entity_type", "building")
      .eq("parent_entity_id", officeId);
    return {
      officeId,
      officeName: flagged[0]?.name,
      office_objects_rooms: objects,
      entity_registry_buildings: buildings,
    };
  });

  await q("Mayor building list query (same as executeMayorTask)", async () => {
    const { data, error } = await supabase
      .from("entity_registry")
      .select("id, name, routing_description")
      .eq("entity_type", "building");
    const cactus = (data ?? []).filter(
      (b) =>
        b.name?.toLowerCase().includes("кактус") ||
        b.name?.toLowerCase().includes("лавка") ||
        b.id === "f83e317c-d4f3-44f3-a47e-88fa76135453",
    );
    return { error: error?.message, totalBuildings: data?.length, cactusMatches: cactus };
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
