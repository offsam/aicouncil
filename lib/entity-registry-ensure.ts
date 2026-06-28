import type { SupabaseClient } from "@supabase/supabase-js";

const CONNECTABLE_ENTITY_TYPES = new Set(["building", "chamber", "agent"]);

/** Slug base from chamber display name (chamber-only; building/agent use other rules). */
export function slugifyChamberName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "chamber"
  );
}

/** Unique slug under a building when names collide (idx_entity_registry_parent_slug). */
export async function resolveUniqueChamberSlug(
  supabase: SupabaseClient,
  buildingEntityId: string,
  name: string,
): Promise<string> {
  const base = slugifyChamberName(name);
  const { data: existing, error } = await supabase
    .from("entity_registry")
    .select("slug")
    .eq("parent_entity_id", buildingEntityId);

  if (error) {
    throw new Error(error.message);
  }

  const taken = new Set((existing ?? []).map((row) => row.slug));
  if (!taken.has(base)) {
    return base;
  }

  for (let suffix = 2; suffix < 10_000; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return `${base}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export async function ensureCityRegistry(
  supabase: SupabaseClient,
  officeId: string,
  officeName?: string | null,
): Promise<void> {
  const { data } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("id", officeId)
    .maybeSingle();

  if (data) return;

  await supabase.from("entity_registry").insert({
    id: officeId,
    entity_type: "city",
    name: officeName?.trim() || "AI Council",
    slug: "ai-council",
    parent_entity_id: null,
  });
}

export async function ensureBuildingRegistry(
  supabase: SupabaseClient,
  building: { id: string; label?: string | null; routing_description?: string | null; office_id: string },
  officeName?: string | null,
): Promise<void> {
  await ensureCityRegistry(supabase, building.office_id, officeName);

  const { data } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("id", building.id)
    .maybeSingle();

  if (data) return;

  const name = building.label?.trim() || `Building ${building.id.substring(0, 8)}`;
  const slug = `building-${building.id.substring(0, 8)}`;
  await supabase.from("entity_registry").insert({
    id: building.id,
    entity_type: "building",
    name,
    slug,
    parent_entity_id: building.office_id,
    routing_description: building.routing_description?.trim() || null,
  });
}

/** Backfill entity_registry for an existing chamber row (rules/knowledge scope). */
export async function ensureChamberRegistryByRegistryId(
  supabase: SupabaseClient,
  entityRegistryId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("id", entityRegistryId)
    .maybeSingle();

  if (existing) return;

  const { data: chamber } = await supabase
    .from("chambers")
    .select("name, building_entity_id")
    .eq("entity_registry_id", entityRegistryId)
    .maybeSingle();

  if (!chamber) {
    throw new Error(`Отдел не найден для entity_registry ${entityRegistryId}`);
  }

  const slug = await resolveUniqueChamberSlug(
    supabase,
    chamber.building_entity_id,
    chamber.name,
  );

  await supabase.from("entity_registry").insert({
    id: entityRegistryId,
    entity_type: "chamber",
    name: chamber.name,
    slug,
    parent_entity_id: chamber.building_entity_id,
  });
}

export async function ensureAgentRegistry(
  supabase: SupabaseClient,
  agent: { id: string; name: string; office_id: string | null },
  chamberRegistryId?: string | null,
): Promise<void> {
  const parentEntityId = chamberRegistryId ?? agent.office_id;
  if (!parentEntityId) return;

  const slug =
    agent.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `agent-${agent.id.substring(0, 8)}`;

  const { data: existing } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("id", agent.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("entity_registry")
      .update({
        name: agent.name,
        ...(chamberRegistryId ? { parent_entity_id: chamberRegistryId } : {}),
      })
      .eq("id", agent.id);
    return;
  }

  await supabase.from("entity_registry").insert({
    id: agent.id,
    entity_type: "agent",
    name: agent.name,
    slug,
    parent_entity_id: parentEntityId,
  });
}

export async function validateConnectionEntities(
  supabase: SupabaseClient,
  sourceEntityId: string,
  targetEntityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (sourceEntityId === targetEntityId) {
    return { ok: false, error: "Нельзя соединить сущность саму с собой" };
  }

  const { data, error } = await supabase
    .from("entity_registry")
    .select("id, entity_type")
    .in("id", [sourceEntityId, targetEntityId]);

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data || data.length !== 2) {
    return {
      ok: false,
      error: "Оба endpoint должны существовать в entity_registry",
    };
  }

  for (const row of data) {
    if (!CONNECTABLE_ENTITY_TYPES.has(row.entity_type)) {
      return {
        ok: false,
        error: `Недопустимый тип сущности для связи: ${row.entity_type}`,
      };
    }
  }

  return { ok: true };
}
